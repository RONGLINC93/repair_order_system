# 用户头像存储目录

此目录用于存储用户上传的头像文件。

## 文件命名规则
- 格式: `avatar-{userId}-{timestamp}.{extension}`
- 例如: `avatar-1-1701234567890-123456789.jpg`

## 支持的格式
- JPG
- PNG
- GIF
- WebP

## 文件大小限制
- 最大文件大小: 5MB

## 访问方式
头像文件可通过以下URL访问:
```
/uploads/avatars/{filename}
```

## 自动清理
已删除用户的头像文件会在管理员删除用户时自动清理。