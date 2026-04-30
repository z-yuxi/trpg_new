import { Router, type IRouter } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { authMiddleware } from '../middleware/auth';
import { uploadLimiter } from '../middleware/rate-limiter';

const router: IRouter = Router();
const uploadsDir = path.resolve(process.cwd(), 'uploads');

fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, _file, cb) => {
    // 先用临时名保存，后续根据真实类型重命名
    const tempName = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    cb(null, tempName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    // 扩展名白名单校验（客户端声明）
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) {
      cb(new Error('不支持的文件扩展名'));
      return;
    }
    // MIME 类型初步校验（客户端可伪造，仅作前置过滤）
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(new Error('仅支持 jpg、png、webp、gif 图片'));
      return;
    }
    cb(null, true);
  },
});

router.post('/', authMiddleware, (req, res) => {
  upload.single('file')(req, res, async (error) => {
    if (error) {
      res.status(400).json({ error: error.message || '上传失败' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: '缺少上传文件' });
      return;
    }

    const tempPath = req.file.path;

    try {
      // 使用 file-type 检测真实文件类型（Magic Bytes 检测，不依赖客户端声明）
      const { fileTypeFromFile } = await import('file-type');
      const detectedType = await fileTypeFromFile(tempPath);

      if (!detectedType || !ALLOWED_MIME_TYPES.has(detectedType.mime)) {
        fs.unlinkSync(tempPath);
        res.status(400).json({ error: '文件内容与声明类型不匹配或不受支持' });
        return;
      }

      // 使用检测到的真实扩展名重命名文件
      const safeExt = '.' + detectedType.ext;
      const finalName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`;
      const finalPath = path.join(uploadsDir, finalName);
      fs.renameSync(tempPath, finalPath);

      res.status(201).json({
        url: `/uploads/${finalName}`,
        filename: finalName,
        size: req.file.size,
        mimeType: detectedType.mime,
      });
    } catch (err) {
      // 清理临时文件
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      console.error('[Upload] Error:', err);
      res.status(500).json({ error: '上传处理失败' });
    }
  });
});

export default router;