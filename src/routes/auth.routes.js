import { Router } from 'express';
import { postLogin } from '../controllers/auth.controller.js';

export const authRoutes = Router();

authRoutes.post('/login', postLogin);
