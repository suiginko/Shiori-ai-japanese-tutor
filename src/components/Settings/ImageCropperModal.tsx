import React, { useState, useRef, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, RotateCcw, Check, RefreshCw } from 'lucide-react';

interface ImageCropperModalProps {
  isOpen: boolean;
  imageSrc: string;
  title?: string;
  onConfirm: (croppedBase64: string) => void;
  onClose: () => void;
}

const CROP_SIZE = 240; // 裁剪圆形视口像素尺寸

export const ImageCropperModal: React.FC<ImageCropperModalProps> = ({
  isOpen,
  imageSrc,
  title = '裁剪头像',
  onConfirm,
  onClose,
}) => {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Reset state when image changes
  useEffect(() => {
    if (isOpen && imageSrc) {
      setScale(1);
      setRotation(0);
      setOffset({ x: 0, y: 0 });
      setImgLoaded(true);

      const testImg = new Image();
      testImg.onload = () => setImgLoaded(true);
      testImg.onerror = () => setImgLoaded(true);
      testImg.src = imageSrc;
    }
  }, [isOpen, imageSrc]);

  if (!isOpen || !imageSrc) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch support
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({
        x: e.touches[0].clientX - offset.x,
        y: e.touches[0].clientY - offset.y,
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    setOffset({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY * -0.0015;
    setScale((prev) => Math.min(Math.max(0.4, prev + delta), 4.0));
  };

  const handleRotateStep = (delta: number) => {
    setRotation((prev) => {
      let next = prev + delta;
      while (next > 180) next -= 360;
      while (next < -180) next += 360;
      return next;
    });
  };

  const handleReset = () => {
    setScale(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  };

  // Execute Canvas Cropping
  const handleCropConfirm = () => {
    try {
      const img = imageRef.current;
      if (!img) {
        onConfirm(imageSrc);
        onClose();
        return;
      }

      const outputSize = 300; // 输出 300x300 高清正方形/正圆形
      const canvas = document.createElement('canvas');
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        onConfirm(imageSrc);
        onClose();
        return;
      }

      // Circular clip for clean transparent circle avatar
      ctx.beginPath();
      ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      // Clean white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, outputSize, outputSize);

      ctx.save();
      // 1. Move origin to canvas center
      ctx.translate(outputSize / 2, outputSize / 2);

      // 2. Apply drag translation in screen coordinates
      const ratio = outputSize / CROP_SIZE;
      ctx.translate(offset.x * ratio, offset.y * ratio);

      // 3. Rotate around image center (free 360° rotation)
      ctx.rotate((rotation * Math.PI) / 180);

      // 4. Calculate dimensions with scale
      const natW = img.naturalWidth || img.width || 300;
      const natH = img.naturalHeight || img.height || 300;
      const drawW = natW * scale * ratio;
      const drawH = natH * scale * ratio;

      // 5. Draw centered
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();

      const croppedDataUrl = canvas.toDataURL('image/png', 0.95);
      onConfirm(croppedDataUrl);
      onClose();
    } catch (err) {
      console.error('Cropping canvas error:', err);
      // Fallback gracefully to original dataUrl
      onConfirm(imageSrc);
      onClose();
    }
  };

  return (
    <div className="modal-overlay cropper-modal-overlay" onClick={onClose}>
      <div
        className="cropper-modal-content"
        onClick={(e) => e.stopPropagation()}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        <div className="cropper-header">
          <div className="cropper-title">{title}</div>
          <button type="button" className="cropper-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="cropper-tip">
          拖拽移动图片位置，使用下方滑块缩放与自由旋转，圆圈内为最终头像可视区域
        </div>

        {/* Viewport Area */}
        <div
          className="cropper-viewport-container"
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onWheel={handleWheel}
        >
          {/* Draggable & Rotatable Image */}
          <img
            ref={imageRef}
            src={imageSrc}
            alt="待裁剪头像"
            className="cropper-source-image"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotation}deg)`,
              cursor: isDragging ? 'grabbing' : 'grab',
            }}
            onLoad={() => setImgLoaded(true)}
            draggable={false}
          />

          {/* Mask with Circular Cutout */}
          <div className="cropper-mask-overlay">
            <div className="cropper-circle-guide" />
          </div>
        </div>

        {/* Controls Toolbar */}
        <div className="cropper-controls-wrapper">
          {/* Row 1: Zoom Slider */}
          <div className="cropper-control-row">
            <div className="control-label-group">
              <span className="control-label-title">缩放</span>
              <span className="control-label-value">{Math.round(scale * 100)}%</span>
            </div>
            <div className="cropper-slider-wrap">
              <button
                type="button"
                className="cropper-icon-btn"
                onClick={() => setScale((s) => Math.max(0.4, Number((s - 0.1).toFixed(2))))}
                title="缩小"
              >
                <ZoomOut size={16} />
              </button>
              <input
                type="range"
                min={0.4}
                max={3.5}
                step={0.05}
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value))}
                className="cropper-slider"
              />
              <button
                type="button"
                className="cropper-icon-btn"
                onClick={() => setScale((s) => Math.min(3.5, Number((s + 0.1).toFixed(2))))}
                title="放大"
              >
                <ZoomIn size={16} />
              </button>
            </div>
          </div>

          {/* Row 2: Free Continuous Rotation Slider */}
          <div className="cropper-control-row">
            <div className="control-label-group">
              <span className="control-label-title">自由旋转</span>
              <button
                type="button"
                className="control-label-badge"
                onClick={() => setRotation(0)}
                title="点击重置为 0°"
              >
                {rotation > 0 ? `+${rotation}°` : `${rotation}°`}
              </button>
            </div>
            <div className="cropper-slider-wrap">
              <button
                type="button"
                className="cropper-icon-btn"
                onClick={() => handleRotateStep(-90)}
                title="逆时针旋转 90°"
              >
                <RotateCcw size={16} />
              </button>
              <input
                type="range"
                min={-180}
                max={180}
                step={1}
                value={rotation}
                onChange={(e) => setRotation(parseInt(e.target.value, 10))}
                className="cropper-slider"
              />
              <button
                type="button"
                className="cropper-icon-btn"
                onClick={() => handleRotateStep(90)}
                title="顺时针旋转 90°"
              >
                <RotateCw size={16} />
              </button>
            </div>
          </div>

          {/* Row 3: Quick Action Buttons */}
          <div className="cropper-quick-actions">
            <button
              type="button"
              className="cropper-mini-btn"
              onClick={() => handleRotateStep(-90)}
              title="逆时针旋转 90 度"
            >
              <RotateCcw size={13} />
              <span>-90°</span>
            </button>
            <button
              type="button"
              className="cropper-mini-btn"
              onClick={() => handleRotateStep(90)}
              title="顺时针旋转 90 度"
            >
              <RotateCw size={13} />
              <span>+90°</span>
            </button>
            <button
              type="button"
              className="cropper-mini-btn"
              onClick={handleReset}
              title="重置缩放与角度"
            >
              <RefreshCw size={13} />
              <span>重置居中</span>
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="cropper-footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleCropConfirm}
          >
            <Check size={16} />
            <span>确认裁剪并应用</span>
          </button>
        </div>
      </div>
    </div>
  );
};
