import React, { useState } from 'react';
import { Camera, FileText, Link as LinkIcon, ShieldCheck, Trash2, Upload, Eye } from 'lucide-react';
import { computeSHA256 } from '../../utils/formatters';

interface AttachmentFieldProps {
  label: string;
  value: string;
  onChange: (newValue: string, meta?: { fileName: string; sha256: string; size: number }) => void;
  sensitive?: boolean;
  helperText?: string;
}

/**
 * Compresses an image file on the client before storing in IndexedDB (Rule 5.2.7)
 */
async function compressImageIfPossible(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذر قراءة الملف المرفق'));
    reader.onload = () => {
      const result = String(reader.result || '');
      if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
        resolve(result);
        return;
      }

      const img = new Image();
      img.onerror = () => resolve(result);
      img.onload = () => {
        const maxDim = 1400;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(result);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.8);
        resolve(compressed);
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}

export const AttachmentField: React.FC<AttachmentFieldProps> = ({
  label,
  value,
  onChange,
  sensitive = false,
  helperText,
}) => {
  const [mode, setMode] = useState<'file' | 'link'>(
    value && value.startsWith('http') ? 'link' : 'file'
  );
  const [fileInfo, setFileInfo] = useState<{ name: string; sha256: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    try {
      const dataUrl = await compressImageIfPossible(file);
      const sha256 = await computeSHA256(dataUrl);
      setFileInfo({ name: file.name, sha256 });
      onChange(dataUrl, { fileName: file.name, sha256, size: dataUrl.length });
    } finally {
      setIsProcessing(false);
    }
  };

  const isDataUrl = value && value.startsWith('data:');
  const isImage = isDataUrl && value.startsWith('data:image/');

  return (
    <div className="p-3 rounded-card border border-border bg-background/50 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text">{label}</span>
          {sensitive && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-danger/15 text-danger font-medium">
              حساس • محجوب عن الداعمين
            </span>
          )}
        </div>

        <div className="inline-flex rounded-btn border border-border bg-surface p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMode('file')}
            className={`px-2.5 py-1 rounded-md font-medium transition ${
              mode === 'file' ? 'bg-primary text-white' : 'text-text-muted hover:text-text'
            }`}
          >
            رفع ملف / كاميرا
          </button>
          <button
            type="button"
            onClick={() => setMode('link')}
            className={`px-2.5 py-1 rounded-md font-medium transition ${
              mode === 'link' ? 'bg-primary text-white' : 'text-text-muted hover:text-text'
            }`}
          >
            رابط خارجي
          </button>
        </div>
      </div>

      {helperText && <p className="text-xs text-text-muted">{helperText}</p>}

      {mode === 'file' ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="ds-btn ds-btn-secondary text-xs py-2 cursor-pointer">
            <Upload className="w-4 h-4 text-primary" />
            <span>{isProcessing ? 'جاري الضغط والحفظ...' : 'اختيار صورة أو PDF'}</span>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
          </label>

          <label className="ds-btn ds-btn-secondary text-xs py-2 cursor-pointer">
            <Camera className="w-4 h-4 text-info" />
            <span>التقاط بالكاميرا</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
            />
          </label>

          {value && (
            <>
              <button
                type="button"
                onClick={() => setPreviewOpen(!previewOpen)}
                className="ds-btn ds-btn-secondary text-xs py-2"
              >
                <Eye className="w-4 h-4 text-success" />
                <span>{previewOpen ? 'إخفاء المعاينة' : 'معاينة المرفق'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setFileInfo(null);
                  onChange('');
                }}
                className="ds-btn text-xs py-2 text-danger hover:bg-danger/10"
                title="حذف المرفق"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <LinkIcon className="w-4 h-4 text-text-muted absolute right-3 top-3.5" />
            <input
              type="url"
              dir="ltr"
              value={isDataUrl ? '' : value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="https://drive.google.com/... أو مسار الملف"
              className="ds-input pr-9 text-sm text-left"
            />
          </div>
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="ds-btn text-xs text-danger hover:bg-danger/10"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {value && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-success">
          <span className="inline-flex items-center gap-1 font-medium">
            <ShieldCheck className="w-4 h-4" />
            <span>
              {isDataUrl
                ? `محفوظ محلياً وجاهز للمزامنة (${fileInfo?.name || 'مرفق موثق'})`
                : `رابط مرفق: ${value.slice(0, 45)}`}
            </span>
          </span>
          {fileInfo?.sha256 && (
            <span className="font-mono text-[11px] text-text-muted" dir="ltr">
              SHA-256: {fileInfo.sha256.slice(0, 14)}...
            </span>
          )}
        </div>
      )}

      {previewOpen && value && (
        <div className="mt-2 p-2 rounded-btn border border-border bg-surface">
          {isImage ? (
            <img
              src={value}
              alt={label}
              className="max-h-60 mx-auto rounded object-contain"
            />
          ) : isDataUrl ? (
            <div className="flex items-center gap-2 text-sm text-text p-3">
              <FileText className="w-5 h-5 text-primary" />
              <span>ملف PDF محفوظ محلياً ({Math.round(value.length / 1024)} KB)</span>
              <a
                href={value}
                download={fileInfo?.name || 'attachment.pdf'}
                className="text-primary underline mr-auto"
              >
                تنزيل الملف
              </a>
            </div>
          ) : (
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary underline break-all"
            >
              فتح الرابط الخارجي: {value}
            </a>
          )}
        </div>
      )}
    </div>
  );
};
