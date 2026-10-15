import { Router } from 'express';
import { login, getSession, logout } from '../controllers/auth.controller.js';

const router = Router();

router.post('/login', login);
router.get('/session', getSession);
router.post('/logout', logout);

export default router;