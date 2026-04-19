import { Router, type IRouter } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { authMiddleware } from '../middleware/auth';

const router: IRouter = Router();
const uploadsDir = path.resolve(process.cwd(), 'uploads');

fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safeExt = path.extname(file.originalname).toLowerCase() || '.jpg';
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    if (!allowedTypes.has(file.mimetype)) {
      cb(new Error('仅支持 jpg、png、webp、gif 图片'));
      return;
    }
    cb(null, true);
  },
});

router.post('/', authMiddleware, (req, res) => {
  upload.single('file')(req, res, (error) => {
    if (error) {
      res.status(400).json({ error: error.message || '上传失败' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: '缺少上传文件' });
      return;
    }

    res.status(201).json({
      url: `/uploads/${req.file.filename}`,
      filename: req.file.filename,
      size: req.file.size,
      mimeType: req.file.mimetype,
    });
  });
});

export default router;