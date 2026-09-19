"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretwatchpartykey2026';
const REFRESH_SECRET = process.env.REFRESH_SECRET || 'supersecretrefreshkey2026';
const createSessionAndTokens = async (userId, req, res) => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user)
        throw new Error('User not found');
    const accessToken = jsonwebtoken_1.default.sign({ userId: user.id, username: user.username, avatarUrl: user.avatarUrl }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = (0, crypto_1.randomBytes)(40).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    const userAgent = req.headers['user-agent'] || 'Unknown Device';
    const ipAddress = req.ip || req.connection?.remoteAddress || 'Unknown IP';
    await prisma.session.deleteMany({ where: { userId, userAgent, ipAddress } });
    await prisma.session.create({ data: { userId, refreshToken, userAgent, ipAddress, expiresAt } });
    res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 7 * 24 * 60 * 60 * 1000
    });
    return { accessToken, user: { id: user.id, username: user.username, avatarUrl: user.avatarUrl } };
};
router.post('/signup', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password)
            return res.status(400).json({ error: 'Username and password are required' });
        const existingUser = await prisma.user.findUnique({ where: { username } });
        if (existingUser)
            return res.status(400).json({ error: 'Username is already taken' });
        const hashedPassword = await bcrypt_1.default.hash(password, 10);
        const user = await prisma.user.create({ data: { username, password: hashedPassword } });
        const result = await createSessionAndTokens(user.id, req, res);
        res.json(result);
    }
    catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password)
            return res.status(400).json({ error: 'Username and password are required' });
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user)
            return res.status(401).json({ error: 'Invalid credentials' });
        const validPassword = await bcrypt_1.default.compare(password, user.password);
        if (!validPassword)
            return res.status(401).json({ error: 'Invalid credentials' });
        const result = await createSessionAndTokens(user.id, req, res);
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/refresh', async (req, res) => {
    try {
        const refreshToken = req.cookies?.refresh_token;
        if (!refreshToken)
            return res.status(401).json({ error: 'No refresh token' });
        const session = await prisma.session.findUnique({ where: { refreshToken }, include: { user: true } });
        if (!session || session.expiresAt < new Date()) {
            res.clearCookie('refresh_token');
            return res.status(401).json({ error: 'Invalid or expired refresh token' });
        }
        await prisma.session.delete({ where: { id: session.id } });
        const result = await createSessionAndTokens(session.userId, req, res);
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/logout', async (req, res) => {
    try {
        const refreshToken = req.cookies?.refresh_token;
        if (refreshToken)
            await prisma.session.deleteMany({ where: { refreshToken } });
        res.clearCookie('refresh_token');
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer '))
            return res.status(401).json({ error: 'Unauthorized' });
        const tokenPart = authHeader.split(' ')[1];
        if (!tokenPart)
            return res.status(401).json({ error: 'Unauthorized' });
        const token = tokenPart;
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        res.json({ user: { id: user.id, username: user.username, avatarUrl: user.avatarUrl } });
    }
    catch (error) {
        res.status(401).json({ error: 'Invalid access token' });
    }
});
router.get('/sessions', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer '))
            return res.status(401).json({ error: 'Unauthorized' });
        const tokenPart = authHeader.split(' ')[1];
        if (!tokenPart)
            return res.status(401).json({ error: 'Unauthorized' });
        const token = tokenPart;
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const sessions = await prisma.session.findMany({ where: { userId: decoded.userId, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
        const currentToken = req.cookies?.refresh_token;
        const cleanSessions = sessions.map(s => ({ id: s.id, userAgent: s.userAgent, ipAddress: s.ipAddress, createdAt: s.createdAt, isCurrent: s.refreshToken === currentToken }));
        res.json({ sessions: cleanSessions });
    }
    catch (error) {
        res.status(401).json({ error: 'Unauthorized' });
    }
});
router.post('/sessions/revoke', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer '))
            return res.status(401).json({ error: 'Unauthorized' });
        const tokenPart = authHeader.split(' ')[1];
        if (!tokenPart)
            return res.status(401).json({ error: 'Unauthorized' });
        const token = tokenPart;
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const currentToken = req.cookies?.refresh_token;
        await prisma.session.deleteMany({ where: { userId: decoded.userId, refreshToken: { not: currentToken } } });
        res.json({ success: true, message: 'All other sessions revoked' });
    }
    catch (error) {
        res.status(401).json({ error: 'Unauthorized' });
    }
});
router.put('/profile', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer '))
            return res.status(401).json({ error: 'Unauthorized' });
        const tokenPart = authHeader.split(' ')[1];
        if (!tokenPart)
            return res.status(401).json({ error: 'Unauthorized' });
        const token = tokenPart;
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const { avatarUrl } = req.body;
        const updatedUser = await prisma.user.update({ where: { id: decoded.userId }, data: { avatarUrl } });
        const result = await createSessionAndTokens(updatedUser.id, req, res);
        res.json(result);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=auth.routes.js.map