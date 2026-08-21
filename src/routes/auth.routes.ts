import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';

const router = Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretwatchpartykey2026';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'supersecretrefreshkey2026';

// Helper to generate tokens and create a session
const createSessionAndTokens = async (userId: string, req: any, res: any) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  // Short lived access token (15 minutes)
  const accessToken = jwt.sign({ userId: user.id, username: user.username, avatarUrl: user.avatarUrl }, JWT_SECRET, { expiresIn: '15m' });
  
  // Long lived refresh token (7 days)
  const refreshToken = randomBytes(40).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const userAgent = req.headers['user-agent'] || 'Unknown Device';
  const ipAddress = req.ip || req.connection?.remoteAddress || 'Unknown IP';

  // Efficient cleanup: remove existing sessions from the exact same device/IP to prevent duplicates
  await prisma.session.deleteMany({
    where: {
      userId,
      userAgent,
      ipAddress
    }
  });

  // Store session in DB
  await prisma.session.create({
    data: {
      userId,
      refreshToken,
      userAgent,
      ipAddress,
      expiresAt
    }
  });

  // Set HTTP-only cookie for refresh token
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  return { accessToken, user: { id: user.id, username: user.username, avatarUrl: user.avatarUrl } };
};

router.post('/signup', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      return res.status(400).json({ error: 'Username is already taken' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
      },
    });
    
    const result = await createSessionAndTokens(user.id, req, res);
    res.json(result);
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const result = await createSessionAndTokens(user.id, req, res);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      return res.status(401).json({ error: 'No refresh token' });
    }

    const session = await prisma.session.findUnique({ where: { refreshToken }, include: { user: true } });
    if (!session || session.expiresAt < new Date()) {
      res.clearCookie('refresh_token');
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // Delete old session
    await prisma.session.delete({ where: { id: session.id } });

    // Create new session & tokens (Rotation)
    const result = await createSessionAndTokens(session.userId, req, res);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const refreshToken = req.cookies?.refresh_token;
    if (refreshToken) {
      await prisma.session.deleteMany({ where: { refreshToken } });
    }
    res.clearCookie('refresh_token');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string, username: string };
    
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user: { id: user.id, username: user.username, avatarUrl: user.avatarUrl } });
  } catch (error) {
    res.status(401).json({ error: 'Invalid access token' });
  }
});

// Advanced Security Feature: Get active sessions
router.get('/sessions', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    
    const sessions = await prisma.session.findMany({ 
      where: { userId: decoded.userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' }
    });
    
    const currentToken = req.cookies?.refresh_token;
    const cleanSessions = sessions.map(s => ({
      id: s.id,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      createdAt: s.createdAt,
      isCurrent: s.refreshToken === currentToken
    }));
    
    res.json({ sessions: cleanSessions });
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized' });
  }
});

// Advanced Security Feature: Revoke all other sessions
router.post('/sessions/revoke', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    
    const currentToken = req.cookies?.refresh_token;
    
    await prisma.session.deleteMany({
      where: {
        userId: decoded.userId,
        refreshToken: { not: currentToken }
      }
    });
    
    res.json({ success: true, message: 'All other sessions revoked' });
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized' });
  }
});

// Update Profile
router.put('/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    
    const { avatarUrl } = req.body;
    
    const updatedUser = await prisma.user.update({
      where: { id: decoded.userId },
      data: { avatarUrl }
    });
    
    // Create new session & tokens to reflect updated avatar in JWT
    const result = await createSessionAndTokens(updatedUser.id, req, res);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
