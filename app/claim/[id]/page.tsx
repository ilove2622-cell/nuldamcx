'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = (error) => reject(error);
  });
};

interface ClaimInfo {
  claim_id: string;
  mall_name: string;
  order_number: string;
  receiver_name: string;
  receiver_phone: string;
  receiver_addr: string;
  product_name: string;
  tracking_number: string;
  claim_type: string;
  resolution: string;
  status: string;
}

interface PhotoItem {
  file: File;
  preview: string;
  base64: string;
}

export default function ClaimUploadPage() {
  const params = useParams();
  const claimId = params.id as string;

  const [claim, setClaim] = useState<ClaimInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const MAX_PHOTOS = 3;

  // 클레임 정보 조회
  useEffect(() => {
    const fetchClaim = async () => {
      try {
        const res = await fetch(`/api/claim/${claimId}`);
        const data = await res.json();
        if (!res.ok || !data.claim) {
          setError('클레임 정보를 찾을 수 없습니다.');
        } else {
          setClaim(data.claim);
          if (data.claim.status === '사진접수') {
            setUploaded(true);
          }
        }
      } catch {
        setError('서버 연결에 실패했습니다.');
      } finally {
        setLoading(false);
      }
    };
    if (claimId) fetchClaim();
  }, [claimId]);

  const addPhoto = async (file: File) => {
    if (photos.length >= MAX_PHOTOS) return;
    try {
      const base64 = await fileToBase64(file);
      const preview = URL.createObjectURL(file);
      setPhotos((prev) => [...prev, { file, preview, base64 }]);
    } catch {
      setUploadError('이미지 변환에 실패했습니다.');
    }
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (photos.length >= MAX_PHOTOS) break;
      await addPhoto(file);
    }
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    for (const file of Array.from(files)) {
      if (photos.length >= MAX_PHOTOS) break;
      if (file.type.startsWith('image/')) await addPhoto(file);
    }
  };

  const handleUpload = async () => {
    if (photos.length === 0) return;
    setUploading(true);
    setUploadError('');
    try {
      const res = await fetch('/api/claim/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claim_id: claimId,
          photos: photos.map((p) => p.base64),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setUploaded(true);
      } else {
        setUploadError(data.error || '업로드에 실패했습니다.');
      }
    } catch {
      setUploadError('네트워크 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }
  };

  // --- UI ---

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <p style={styles.loadingText}>불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <h2 style={styles.errorTitle}>오류</h2>
          <p style={styles.errorText}>{error}</p>
        </div>
      </div>
    );
  }

  if (uploaded) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.successIcon}>&#10004;</div>
          <h2 style={styles.successTitle}>사진 제출 완료</h2>
          <p style={styles.successText}>
            접수번호 <strong>{claimId}</strong>의 사진이 정상적으로 제출되었습니다.
            <br />
            담당자 확인 후 처리해 드리겠습니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* 헤더 */}
        <div style={styles.header}>
          <img src="/nuldam-logo.png" alt="널담" style={styles.logo} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <h1 style={styles.title}>클레임 사진 제출</h1>
        </div>

        {/* 클레임 정보 */}
        {claim && (
          <div style={styles.infoBox}>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>접수번호</span>
              <span style={styles.infoValue}>{claim.claim_id}</span>
            </div>
            {claim.mall_name && (
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>주문사이트</span>
                <span style={styles.infoValue}>{claim.mall_name}</span>
              </div>
            )}
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>주문번호</span>
              <span style={styles.infoValue}>{claim.order_number}</span>
            </div>
            {claim.receiver_name && (
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>수취인</span>
                <span style={styles.infoValue}>{claim.receiver_name}</span>
              </div>
            )}
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>상품</span>
              <span style={styles.infoValue}>{claim.product_name}</span>
            </div>
            {claim.tracking_number && (
              <div style={styles.infoRow}>
                <span style={styles.infoLabel}>송장번호</span>
                <span style={styles.infoValue}>{claim.tracking_number}</span>
              </div>
            )}
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>유형</span>
              <span style={styles.infoBadge}>{claim.claim_type}</span>
            </div>
            <div style={styles.infoRow}>
              <span style={styles.infoLabel}>처리요청</span>
              <span style={styles.infoBadge}>{claim.resolution}</span>
            </div>
          </div>
        )}

        {/* 안내 */}
        <p style={styles.guide}>
          파손/불량 상태를 확인할 수 있는 사진을 올려주세요. (최대 {MAX_PHOTOS}장)
        </p>

        {/* 업로드 영역 */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            ...styles.dropZone,
            borderColor: isDragging ? '#3b82f6' : '#d1d5db',
            backgroundColor: isDragging ? '#eff6ff' : '#fafafa',
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            hidden
            onChange={handleFileChange}
          />
          <div style={styles.dropIcon}>&#128247;</div>
          <p style={styles.dropText}>사진을 촬영하거나 선택해 주세요</p>
          <p style={styles.dropSubtext}>터치하여 카메라/갤러리 열기</p>
        </div>

        {/* 미리보기 */}
        {photos.length > 0 && (
          <div style={styles.previewGrid}>
            {photos.map((photo, idx) => (
              <div key={idx} style={styles.previewItem}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.preview} alt={`사진 ${idx + 1}`} style={styles.previewImg} />
                <button onClick={(e) => { e.stopPropagation(); removePhoto(idx); }} style={styles.removeBtn}>
                  &#10005;
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 에러 */}
        {uploadError && <p style={styles.errorMsg}>{uploadError}</p>}

        {/* 제출 버튼 */}
        <button
          onClick={handleUpload}
          disabled={photos.length === 0 || uploading}
          style={{
            ...styles.submitBtn,
            opacity: photos.length === 0 || uploading ? 0.5 : 1,
          }}
        >
          {uploading ? '업로드 중...' : `사진 제출하기 (${photos.length}/${MAX_PHOTOS})`}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f8fafc',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: '20px 16px',
  },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#fff',
    borderRadius: 16,
    boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    padding: '28px 24px',
  },
  header: {
    textAlign: 'center' as const,
    marginBottom: 20,
  },
  logo: {
    height: 32,
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: '#1e293b',
    margin: 0,
  },
  infoBox: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: '16px',
    marginBottom: 20,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: 500,
  },
  infoValue: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: 600,
  },
  infoBadge: {
    fontSize: 13,
    color: '#3b82f6',
    fontWeight: 600,
    backgroundColor: '#dbeafe',
    padding: '2px 10px',
    borderRadius: 12,
  },
  guide: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 16,
    lineHeight: 1.6,
  },
  dropZone: {
    border: '2px dashed #d1d5db',
    borderRadius: 12,
    padding: '32px 16px',
    textAlign: 'center' as const,
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginBottom: 16,
  },
  dropIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  dropText: {
    fontSize: 15,
    fontWeight: 600,
    color: '#334155',
    margin: '0 0 4px',
  },
  dropSubtext: {
    fontSize: 13,
    color: '#94a3b8',
    margin: 0,
  },
  previewGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 12,
    marginBottom: 16,
  },
  previewItem: {
    position: 'relative' as const,
    borderRadius: 8,
    overflow: 'hidden',
    aspectRatio: '1',
  },
  previewImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    borderRadius: 8,
    border: '1px solid #e2e8f0',
  },
  removeBtn: {
    position: 'absolute' as const,
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: '50%',
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#fff',
    border: 'none',
    fontSize: 12,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtn: {
    width: '100%',
    padding: '14px',
    backgroundColor: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
  },
  loadingText: {
    textAlign: 'center' as const,
    color: '#64748b',
    fontSize: 15,
  },
  errorTitle: {
    textAlign: 'center' as const,
    color: '#ef4444',
    fontSize: 18,
  },
  errorText: {
    textAlign: 'center' as const,
    color: '#64748b',
    fontSize: 14,
  },
  errorMsg: {
    color: '#ef4444',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center' as const,
  },
  successIcon: {
    textAlign: 'center' as const,
    fontSize: 48,
    color: '#10b981',
    marginBottom: 12,
  },
  successTitle: {
    textAlign: 'center' as const,
    color: '#1e293b',
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 8,
  },
  successText: {
    textAlign: 'center' as const,
    color: '#64748b',
    fontSize: 14,
    lineHeight: 1.8,
  },
};
