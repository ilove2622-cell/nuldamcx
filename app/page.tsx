'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

import { CHANNEL_URL_MAP, STATUS_OPTIONS, MALL_OPTIONS, CHANNEL_MAP, QUICK_LINKS } from '@/lib/constants';

// MUI Components
import {
  Box, Container, Typography, IconButton, Button,
  Card, CardContent, TextField, Checkbox, Stack, CircularProgress,
  MenuItem, Select, InputAdornment, Chip, TablePagination, Collapse, Link as MuiLink, Divider,
  Fab, Menu, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';

// Icons
import {
  CloudDownload as CloudDownloadIcon,
  AutoAwesome as AutoAwesomeIcon,
  Send as SendIcon,
  RocketLaunch as RocketLaunchIcon,
  Search as SearchIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon,
  LocalShipping as LocalShippingIcon,
  Person as PersonIcon,
  Phone as PhoneIcon,
  Home as HomeIcon,
  SmartToy as SmartToyIcon,
  CheckCircleOutline as CheckCircleIcon,
  Launch as LaunchIcon,
  Link as LinkIcon,
  UploadFile as UploadFileIcon,
  DocumentScanner as DocumentScannerIcon, // 💡 [추가] OCR용 스캐너 아이콘
  Biotech as BiotechIcon, // VOC 이물질 분석 아이콘
  ContentCopy as ContentCopyIcon,
  Check as CheckIcon,
  HeadsetMic as HeadsetMicIcon,
} from '@mui/icons-material';

// ==========================================
// 🌟 1. 상수 및 헬퍼 함수
// ==========================================

const getStandardChannelName = (rawName: string) => CHANNEL_MAP[rawName] || rawName;
const getChannelUrl = (channelName: string) => CHANNEL_URL_MAP[channelName] || '#';

const getSafeTime = (inquiryDate?: string, collectedAt?: string) => {
  const t1 = inquiryDate ? new Date(inquiryDate).getTime() : 0;
  const t2 = collectedAt ? new Date(collectedAt).getTime() : 0;
  return Math.max(t1, t2);
};

const getDisplayTime = (inquiryDate?: string, collectedAt?: string) => {
  if (inquiryDate && inquiryDate.includes(':')) return inquiryDate;
  let formattedCollectedTime = '';
  if (collectedAt) {
    const rawString = collectedAt.split('+')[0].split('Z')[0].replace('T', ' '); 
    formattedCollectedTime = rawString.substring(0, 16);
  }
  if (inquiryDate && !inquiryDate.includes(':')) {
    if (formattedCollectedTime.includes(' ')) {
      const timePart = formattedCollectedTime.split(' ')[1]; 
      return `${inquiryDate} ${timePart}`; 
    }
    return inquiryDate;
  }
  return formattedCollectedTime || '시간 정보 없음';
};

const getStatusColor = (status: string) => {
  if (status === '대기' || status === '신규') return { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' };
  if (status === '답변저장') return { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' };
  if (status === '전송요청') return { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)' };
  if (status === '처리완료') return { color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' };
  return { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.1)' };
};

const getSabangnetOrderUrl = (orderNumber?: string) => {
  if (!orderNumber || orderNumber.trim() === '' || orderNumber === '-') return '#';
  const today = new Date();
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(today.getMonth() - 3);

  const formatDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  };

  const startDate = formatDate(threeMonthsAgo);
  const endDate = formatDate(today);

  return `https://sbadmin15.sabangnet.co.kr/#/popup/views/pages/order/order-confirm?searchCondition=order_id&searchKeyword=${orderNumber}&svcAcntId=mw141500&mode=search&prdNmDiv=prod_nm&startDate=${startDate}&endDate=${endDate}&amtDiv=total_cost&menuNo=938`;
};

const formatTrackingNumber = (num?: string) => {
  if (!num) return '';
  const cleaned = num.replace(/\D/g, ''); 
  return cleaned.replace(/(\d{4})(?=\d)/g, '$1-').replace(/-$/, ''); 
};

const getTrackingUrl = (channel: string, trackingNum?: string) => {
  if (!trackingNum) return '#';
  const cleanNum = trackingNum.replace(/\D/g, '');
  const standardChannel = getStandardChannelName(channel);
  
  if (standardChannel === '네이버' || standardChannel === '이베이') {
    return `https://trace.cjlogistics.com/next/tracking.html?wblNo=${cleanNum}`;
  }
  return `https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${cleanNum}`;
};

interface DBInquiry {
  id: string;
  sabangnet_num: string;
  channel: string;
  order_number: string;
  customer_name: string;
  content: string;
  inquiry_date: string;
  status: string;
  ai_draft: string | null;
  admin_reply: string | null;
  collected_at?: string; 
  receiver_name?: string;
  receiver_tel?: string;
  shipping_address?: string;
  tracking_number?: string;
  product_name?: string;
  /** 사방넷에서 가져온 주문 상품 목록 (분리행/사은품 포함) */
  order_items?: OrderItem[] | null;
}

export interface OrderItem {
  productId?: string;
  mallProductId?: string;
  productName?: string;
  skuAlias?: string;
  sku?: string;
  option?: string;
  unitName?: string;
  barcode?: string;
  qty?: number;
  gift?: boolean;
  giftName?: string;
}

export default function IntegratedDashboardPage() {
  const router = useRouter();
  
  // ==========================================
  // 🧠 2. 상태(State) 관리
  // ==========================================
  const [allData, setAllData] = useState<DBInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState({ total: 0, pending: 0, completed: 0, reviewing: 0 });

  const [sortOrder, setSortOrder] = useState('desc'); 
  const [filterStatus, setFilterStatus] = useState('전체');
  const [filterMall, setFilterMall] = useState('전체');
  const [filterCategory, setFilterCategory] = useState('전체');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({});
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTriggeringBot, setIsTriggeringBot] = useState(false);
  const [isCollectingAll, setIsCollectingAll] = useState(false);
  
  const [isGeneratingAI, setIsGeneratingAI] = useState<Record<string, boolean>>({});
  const [isGeneratingBulkAI, setIsGeneratingBulkAI] = useState(false);
  
  const [isUploadingScript, setIsUploadingScript] = useState(false);

  const [linkAnchorEl, setLinkAnchorEl] = useState<null | HTMLElement>(null);
  const [isSavingSheet, setIsSavingSheet] = useState<Record<string, boolean>>({});

  // 문의 내용 펼치기 (모바일)
  const [expandedContent, setExpandedContent] = useState<Record<string, boolean>>({});

  // 모달 상태
  const [orderModalData, setOrderModalData] = useState<DBInquiry | null>(null);
  const [trackingModalData, setTrackingModalData] = useState<{ channel: string; trackingNumber: string; trackingUrl: string } | null>(null);
  const [trackingResult, setTrackingResult] = useState<{ carrier: string; currentStatus: string; steps: { date: string; location: string; status: string }[] } | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  // ==========================================
  // 📡 3. 데이터 페칭 & 보안 검증
  // ==========================================
  const fetchDataAndCounts = async () => {
    setLoading(true);
    
    const { count: total } = await supabase.from('inquiries').select('*', { count: 'exact', head: true });
    const { count: pending } = await supabase.from('inquiries').select('*', { count: 'exact', head: true }).in('status', ['신규', '대기']);
    const { count: completed } = await supabase.from('inquiries').select('*', { count: 'exact', head: true }).eq('status', '처리완료');
    const { count: reviewing } = await supabase.from('inquiries').select('*', { count: 'exact', head: true }).eq('status', '답변저장');
    
    setCounts({ total: total || 0, pending: pending || 0, completed: completed || 0, reviewing: reviewing || 0 });

    const { data, error } = await supabase.from('inquiries').select('*');

    if (!error && data) {
      setAllData(data);
      const initialReplies: Record<string, string> = {};
      data.forEach(item => {
        initialReplies[item.id] = item.admin_reply || item.ai_draft || '';
      });
      setReplyTexts(initialReplies);
    }
    setLoading(false);
    setSelectedIds([]); 
  };

  useEffect(() => { fetchDataAndCounts(); }, []);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const allowedEmails = ['cx@joinandjoin.com', 'ilove2622@nuldam.com'];
      if (!session || !allowedEmails.includes(session?.user?.email || '')) {
        router.replace('/login');
      }
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const allowedEmails = ['cx@joinandjoin.com', 'ilove2622@nuldam.com'];
      if (event === 'SIGNED_OUT' || !session || !allowedEmails.includes(session?.user?.email || '')) {
        router.replace('/login');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  // ==========================================
  // 🎯 4. 필터링, 정렬, 그룹화
  // ==========================================
  const filteredData = useMemo(() => {
    return allData.filter(item => {
      const standardChannel = getStandardChannelName(item.channel);
      if (filterStatus !== '전체' && item.status !== filterStatus) return false;
      if (filterMall !== '전체') {
        if (filterMall === '기타') {
          const mainMalls = MALL_OPTIONS.slice(1, -1);
          if (mainMalls.includes(standardChannel)) return false; 
        } else if (standardChannel !== filterMall) return false;
      }
      if (startDate && item.inquiry_date < startDate) return false;
      if (endDate && item.inquiry_date > endDate) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const isMatch = 
          (item.customer_name && item.customer_name.toLowerCase().includes(query)) ||
          (item.order_number && item.order_number.toLowerCase().includes(query)) ||
          (item.content && item.content.toLowerCase().includes(query)) ||
          (item.product_name && item.product_name.toLowerCase().includes(query));
        if (!isMatch) return false;
      }
      return true;
    });
  }, [allData, filterStatus, filterMall, startDate, endDate, searchQuery]);

  const groupedData = useMemo(() => {
    const groupsMap: Record<string, DBInquiry[]> = {};

    filteredData.forEach(item => {
      const orderNum = item.order_number?.trim();
      const key = (orderNum && orderNum !== '-' && orderNum !== '') ? orderNum : `single-${item.id}`;
      if (!groupsMap[key]) groupsMap[key] = [];
      groupsMap[key].push(item);
    });

    const groupsArray = Object.values(groupsMap);
    
    groupsArray.forEach(group => {
      group.sort((a, b) => getSafeTime(b.inquiry_date, b.collected_at) - getSafeTime(a.inquiry_date, a.collected_at));
    });

    groupsArray.sort((groupA, groupB) => {
      const timeA = getSafeTime(groupA[0].inquiry_date, groupA[0].collected_at);
      const timeB = getSafeTime(groupB[0].inquiry_date, groupB[0].collected_at);
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB; 
    });

    return groupsArray;
  }, [filteredData, sortOrder]);

  const paginatedData = useMemo(() => {
    const start = page * rowsPerPage;
    return groupedData.slice(start, start + rowsPerPage);
  }, [groupedData, page, rowsPerPage]);

  // ==========================================
  // ⚙️ 5. 액션 핸들러
  // ==========================================
  const allIdsInPage = paginatedData.flatMap(group => group.map(item => item.id));
  const isAllPageSelected = allIdsInPage.length > 0 && allIdsInPage.every(id => selectedIds.includes(id));
  const isSomePageSelected = allIdsInPage.some(id => selectedIds.includes(id)) && !isAllPageSelected;

  const handleSelectAllPageClick = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.checked) setSelectedIds(prev => Array.from(new Set([...prev, ...allIdsInPage])));
    else setSelectedIds(prev => prev.filter(id => !allIdsInPage.includes(id)));
  };

  const handleClick = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  const handleReplyChange = (id: string, newText: string) => {
    setReplyTexts(prev => ({ ...prev, [id]: newText }));
  };

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const handleCollectAll = async () => { setIsCollectingAll(true); try { await fetch("/api/collect", { method: "POST" }); fetchDataAndCounts(); } finally { setIsCollectingAll(false); } };


  const handleBulkSubmit = async () => {
    setIsSubmitting(true);
    try {
      await Promise.all(selectedIds.map(id => supabase.from('inquiries').update({ admin_reply: replyTexts[id], status: '답변저장' }).eq('id', id)));
      alert(`${selectedIds.length}건의 답변이 저장되었습니다.`);
      fetchDataAndCounts();
    } finally { setIsSubmitting(false); }
  };

  const handleTriggerBot = async () => {
    setIsTriggeringBot(true);
    try {
      // 1. 답변저장 상태인 항목을 전송요청으로 변경 (로컬 봇이 감지)
      const { data, error } = await supabase
        .from('inquiries')
        .update({ status: '전송요청' })
        .eq('status', '답변저장')
        .select();

      if (error) throw new Error(error.message);

      const count = data?.length || 0;
      if (count > 0) {
        alert(`✅ ${count}건의 송신 요청 완료!\n\n로컬 봇이 자동으로 사방넷에 전송합니다.`);
      } else {
        alert('전송할 답변이 없습니다. 먼저 답변을 저장해주세요.');
      }
      fetchDataAndCounts();
    } finally { setIsTriggeringBot(false); }
  };

  // 모달 항목 복사 — 어떤 키가 방금 복사됐는지 표시 (체크 아이콘 깜빡임용)
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyToClipboard = async (text: string, key: string) => {
    if (!text || text === '-') return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback: textarea
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(prev => (prev === key ? null : prev)), 1200);
  };

  // 사방넷 주문 상세(상품/배송) 재조회
  const [isRefetchingOrder, setIsRefetchingOrder] = useState<Record<string, boolean>>({});
  const handleRefetchOrder = async (item: DBInquiry) => {
    if (!item.order_number || item.order_number === '-') {
      alert('주문번호가 없어 사방넷 조회가 불가합니다.');
      return;
    }
    setIsRefetchingOrder(prev => ({ ...prev, [item.id]: true }));
    try {
      const res = await fetch('/api/order-details/refetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, orderNumber: item.order_number }),
      });
      const json = await res.json();
      if (!json.success) {
        alert(`사방넷 조회 실패: ${json.error || '알 수 없는 오류'}`);
      } else {
        await fetchDataAndCounts();
      }
    } catch (e: any) {
      alert(`재조회 실패: ${e?.message || e}`);
    } finally {
      setIsRefetchingOrder(prev => ({ ...prev, [item.id]: false }));
    }
  };

  const handleForceComplete = async (id: string) => {
    if (!window.confirm('이 문의를 강제로 [처리완료] 상태로 변경하시겠습니까?')) return;
    try {
      await supabase.from('inquiries').update({ status: '처리완료' }).eq('id', id);
      fetchDataAndCounts(); 
    } catch (error) {
      console.error("상태 변경 실패:", error);
    }
  };

  const handleSaveToSheet = async (item: DBInquiry) => {
    setIsSavingSheet(prev => ({ ...prev, [item.id]: true }));
    try {
      const resSheet = await fetch('/api/sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: getStandardChannelName(item.channel) || '-',
          orderNumber: item.order_number || '-',
          customerName: item.customer_name || '-',
          tel: item.receiver_tel || '-',
          address: item.shipping_address || '-', 
          trackingNumber: item.tracking_number ? formatTrackingNumber(item.tracking_number) : '-',
        })
      });
      const dataSheet = await resSheet.json();

      const currentScript = replyTexts[item.id] || item.admin_reply || item.ai_draft || '';
      if (currentScript.trim()) {
        await fetch('/api/scripts/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inquiryId: item.id,
            orderNumber: item.order_number || '-',
            customerName: item.customer_name || '-',
            script: currentScript
          })
        }).catch(err => console.error("스크립트 업로드 에러:", err));
      }
      
      const safeName = item.customer_name ? item.customer_name : '고객';
      
      if (dataSheet.success) {
        alert(`✅ [${safeName}]님의 정보와 스크립트가 성공적으로 저장되었습니다!`);
      } else {
        if (dataSheet.error === 'TODAY_TAB_MISSING') {
          alert(`❌ 시트에 오늘 날짜 탭이 없습니다!\n스프레드시트 하단에 오늘 날짜 탭을 먼저 생성해 주세요.`);
        } else {
          alert('❌ 저장 실패: ' + dataSheet.error);
        }
      }
    } catch (error) {
      alert('❌ 네트워크 오류가 발생했습니다.');
    } finally {
      setIsSavingSheet(prev => ({ ...prev, [item.id]: false }));
    }
  };

  const handleExcelUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingScript(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/scripts/upload-excel', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success) {
        alert('✅ 엑셀 스크립트가 성공적으로 업로드되었습니다!');
      } else {
        alert('❌ 업로드 실패: ' + (data.error || '알 수 없는 오류'));
      }
    } catch (error) {
      console.error('엑셀 업로드 에러:', error);
      alert('❌ 네트워크 오류가 발생했습니다. 백엔드에 upload-excel 폴더가 있는지 확인해주세요!');
    } finally {
      setIsUploadingScript(false);
      event.target.value = '';
    }
  };

  const handleGenerateAI = async (id: string) => {
    setIsGeneratingAI(prev => ({ ...prev, [id]: true }));
    try {
      const targetInquiry = allData.find(item => item.id === id);
      if (!targetInquiry) return;

      const response = await fetch('/api/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inquiryContent: targetInquiry.content }),
      });

      const data = await response.json();

      if (response.ok) {
        setReplyTexts(prev => ({ ...prev, [id]: data.draft }));
      } else {
        alert('AI 초안 생성 실패: ' + data.error);
      }
    } catch (error) {
      console.error("AI 생성 실패:", error);
      alert('네트워크 오류가 발생했습니다.');
    } finally {
      setIsGeneratingAI(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleBulkGenerateAI = async () => {
    if (selectedIds.length === 0) return;
    
    const validIds = selectedIds.filter(id => {
      const target = allData.find(item => item.id === id);
      return target && (target.status === '대기' || target.status === '신규');
    });

    if (validIds.length === 0) {
      alert("선택된 문의 중 AI 답변을 생성할 수 있는 대기/신규 건이 없습니다.");
      return;
    }

    setIsGeneratingBulkAI(true);
    
    const loadingState: Record<string, boolean> = {};
    validIds.forEach(id => { loadingState[id] = true; });
    setIsGeneratingAI(prev => ({ ...prev, ...loadingState }));

    try {
      for (const id of validIds) {
        const targetInquiry = allData.find(item => item.id === id);
        if (!targetInquiry) continue;

        try {
          const response = await fetch('/api/generate-draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inquiryContent: targetInquiry.content }),
          });
          const data = await response.json();

          if (response.ok) {
            setReplyTexts(prev => ({ ...prev, [id]: data.draft }));
          } else {
            setReplyTexts(prev => ({ ...prev, [id]: `생성 실패: ${data.error}` }));
          }
        } catch (err) {
          setReplyTexts(prev => ({ ...prev, [id]: "네트워크 오류" }));
        }

        setIsGeneratingAI(prev => ({ ...prev, [id]: false }));

        await new Promise(resolve => setTimeout(resolve, 4500));
      }

    } catch (error) {
      console.error("AI 일괄 생성 실패:", error);
      alert("일괄 생성 중 오류가 발생했습니다.");
    } finally {
      setIsGeneratingBulkAI(false);
      
      const doneState: Record<string, boolean> = {};
      validIds.forEach(id => { doneState[id] = false; });
      setIsGeneratingAI(prev => ({ ...prev, ...doneState }));
    }
  };
  
  // ==========================================
  // 🔧 5-b. 콘텐츠 헬퍼
  // ==========================================

  /** URL을 [이미지 보기] 링크로 대체 */
  const renderContent = (text: string) => {
    if (!text) return text;
    const urlRegex = /https?:\/\/\S+/g;
    const nodes: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    urlRegex.lastIndex = 0;
    while ((m = urlRegex.exec(text)) !== null) {
      if (m.index > last) nodes.push(text.slice(last, m.index));
      nodes.push(
        <MuiLink key={m.index} href={m[0]} target="_blank" rel="noopener noreferrer"
          sx={{ color: '#60a5fa', textDecoration: 'underline', overflowWrap: 'break-word', wordBreak: 'break-all', fontSize: 'inherit' }}>
          [이미지 보기]
        </MuiLink>
      );
      last = m.index + m[0].length;
    }
    if (last < text.length) nodes.push(text.slice(last));
    return nodes.length > 0 ? nodes : text;
  };

  // ==========================================
  // 🎨 6. 화면 렌더링 (UI)
  // ==========================================
  const SUMMARY_DATA = [
    { title: '전체 문의', count: counts.total, color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)' },
    { title: '대기중 (신규포함)', count: counts.pending, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
    { title: '답변저장', count: counts.reviewing, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)' },
    { title: '처리완료', count: counts.completed, color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)' },
  ];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'transparent', color: '#f8fafc', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      
      {/* 💡 빠른 링크 플로팅 버튼 (우측 하단) */}
      <Box sx={{ position: 'fixed', bottom: 32, right: 32, zIndex: 9999 }}>
        <Fab 
          color="primary" 
          onClick={(e) => setLinkAnchorEl(e.currentTarget)}
          sx={{ 
            bgcolor: '#3b82f6', color: '#fff', 
            boxShadow: '0 4px 14px rgba(59, 130, 246, 0.5)',
            '&:hover': { bgcolor: '#2563eb' } 
          }}
        >
          <LinkIcon />
        </Fab>
        <Menu
          anchorEl={linkAnchorEl}
          open={Boolean(linkAnchorEl)}
          onClose={() => setLinkAnchorEl(null)}
          anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
          transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          PaperProps={{
            elevation: 3,
            sx: {
              bgcolor: 'rgba(30, 41, 59, 0.95)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#f8fafc',
              mt: -1,
              ml: 1,
              borderRadius: '12px',
              minWidth: '220px'
            }
          }}
        >
          <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.05)', mb: 1 }}>
            <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 700 }}>CS 채널 빠른 이동</Typography>
          </Box>
          {QUICK_LINKS.map((link) => (
            <MenuItem 
              key={link.name} 
              onClick={() => {
                window.open(link.url, '_blank');
                setLinkAnchorEl(null);
              }}
              sx={{ 
                py: 1.5, px: 2, fontSize: '0.85rem', fontWeight: 500,
                display: 'flex', justifyContent: 'space-between',
                '&:hover': { bgcolor: 'rgba(59, 130, 246, 0.1)' }
              }}
            >
              {link.name}
              <LaunchIcon sx={{ fontSize: 14, color: '#64748b' }} />
            </MenuItem>
          ))}
        </Menu>
      </Box>

      {/* 네비게이션은 layout.tsx의 NavBar에서 공통 제공 */}

      <Container maxWidth="xl" sx={{ mt: 2, mb: 8, flex: 1, px: { xs: 2, sm: 3, lg: 4 } }}>
        
        {/* --- KPI 요약 보드 --- */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 2, mb: 2 }}>
          {SUMMARY_DATA.map((item, index) => (
            <Card key={index} elevation={0} sx={{ bgcolor: 'rgba(30, 41, 59, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', backdropFilter: 'blur(10px)' }}>
              <CardContent sx={{ p: { xs: '12px 16px !important', lg: '16px 20px !important' } }}>
                <Typography variant="caption" sx={{ color: '#94a3b8', fontWeight: 600, mb: 0.5, display: 'block', fontSize: { xs: '0.7rem', lg: '0.75rem' } }}>{item.title}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                  <Typography sx={{ color: item.color, fontWeight: 800, fontSize: { xs: '1.5rem', lg: '2rem' }, lineHeight: 1.2 }}>{item.count}</Typography>
                  <Typography variant="caption" sx={{ color: '#64748b', fontSize: { xs: '0.7rem', lg: '0.8rem' } }}>건</Typography>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>

        {/* --- 슈퍼 필터 바 --- */}
        <Box sx={{ px: 1.5, py: 1, mb: 2, bgcolor: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', display: 'flex', gap: 1, flexWrap: { xs: 'wrap', xl: 'nowrap' }, alignItems: 'flex-end' }}>
          <Box sx={{ flex: 1, minWidth: '90px' }}>
            <Typography variant="caption" sx={{ color: '#94a3b8', mb: 0.2, fontSize: '0.7rem', display: 'block' }}>정렬</Typography>
            <Select fullWidth size="small" value={sortOrder} onChange={(e) => { setSortOrder(e.target.value); setPage(0); }} sx={{ bgcolor: 'rgba(15, 23, 42, 0.5)', color: '#f8fafc', borderRadius: '6px', fontSize: '0.8rem', height: '32px', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }}>
              <MenuItem value="desc" sx={{ fontSize: '0.8rem' }}>최근순</MenuItem>
              <MenuItem value="asc" sx={{ fontSize: '0.8rem' }}>오래된순</MenuItem>
            </Select>
          </Box>
          <Box sx={{ flex: 1, minWidth: '80px' }}>
            <Typography variant="caption" sx={{ color: '#94a3b8', mb: 0.2, fontSize: '0.7rem', display: 'block' }}>상태</Typography>
            <Select fullWidth size="small" value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }} sx={{ bgcolor: 'rgba(15, 23, 42, 0.5)', color: '#f8fafc', borderRadius: '6px', fontSize: '0.8rem', height: '32px', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }}>
              {STATUS_OPTIONS.map(opt => <MenuItem key={opt} value={opt} sx={{ fontSize: '0.8rem' }}>{opt}</MenuItem>)}
            </Select>
          </Box>
          <Box sx={{ flex: 1, minWidth: '100px' }}>
            <Typography variant="caption" sx={{ color: '#94a3b8', mb: 0.2, fontSize: '0.7rem', display: 'block' }}>쇼핑몰</Typography>
            <Select fullWidth size="small" value={filterMall} onChange={(e) => { setFilterMall(e.target.value); setPage(0); }} sx={{ bgcolor: 'rgba(15, 23, 42, 0.5)', color: '#f8fafc', borderRadius: '6px', fontSize: '0.8rem', height: '32px', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }}>
              {MALL_OPTIONS.map(opt => <MenuItem key={opt} value={opt} sx={{ fontSize: '0.8rem' }}>{opt}</MenuItem>)}
            </Select>
          </Box>
          <Box sx={{ flex: 1, minWidth: '90px' }}>
            <Typography variant="caption" sx={{ color: '#94a3b8', mb: 0.2, fontSize: '0.7rem', display: 'block' }}>카테고리</Typography>
            <Select fullWidth size="small" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} sx={{ bgcolor: 'rgba(15, 23, 42, 0.5)', color: '#f8fafc', borderRadius: '6px', fontSize: '0.8rem', height: '32px', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.1)' } }}>
              <MenuItem value="전체" sx={{ fontSize: '0.8rem' }}>전체</MenuItem>
            </Select>
          </Box>
          <Box sx={{ flex: 1.2, minWidth: '110px' }}>
            <Typography variant="caption" sx={{ color: '#94a3b8', mb: 0.2, fontSize: '0.7rem', display: 'block' }}>시작일</Typography>
            <TextField type="date" fullWidth size="small" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(0); }} sx={{ bgcolor: 'rgba(15, 23, 42, 0.5)', borderRadius: '6px', input: { color: '#f8fafc', colorScheme: 'dark', fontSize: '0.8rem', py: '6.5px' }, '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' } }} />
          </Box>
          <Box sx={{ flex: 1.2, minWidth: '110px' }}>
            <Typography variant="caption" sx={{ color: '#94a3b8', mb: 0.2, fontSize: '0.7rem', display: 'block' }}>종료일</Typography>
            <TextField type="date" fullWidth size="small" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(0); }} sx={{ bgcolor: 'rgba(15, 23, 42, 0.5)', borderRadius: '6px', input: { color: '#f8fafc', colorScheme: 'dark', fontSize: '0.8rem', py: '6.5px' }, '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' } }} />
          </Box>
          <Box sx={{ flex: 2, minWidth: '180px' }}>
            <Typography variant="caption" sx={{ color: '#94a3b8', mb: 0.2, fontSize: '0.7rem', display: 'block' }}>검색</Typography>
            <TextField fullWidth size="small" placeholder="고객명, 내용, 주문번호, 상품명" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }} InputProps={{ startAdornment: (<InputAdornment position="start"><SearchIcon sx={{ color: '#64748b', fontSize: '1rem' }} /></InputAdornment>) }} sx={{ bgcolor: 'rgba(15, 23, 42, 0.5)', borderRadius: '6px', input: { color: '#f8fafc', fontSize: '0.8rem', py: '6.5px' }, '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' } }} />
          </Box>
        </Box>

        {/* --- 액션 컨트롤 바 --- */}
        <Box sx={{ mb: 2, px: 2, py: 1.5, bgcolor: 'rgba(30, 41, 59, 0.8)', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
          {/* 전체 선택 행 */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <Checkbox color="primary" size="small" indeterminate={isSomePageSelected} checked={isAllPageSelected} onChange={handleSelectAllPageClick} sx={{ color: '#64748b', '&.Mui-checked': { color: '#3b82f6' }, p: 0.5 }} />
            <Typography variant="body2" sx={{ color: '#f8fafc', fontWeight: 600, fontSize: '0.8rem' }}>전체 선택 <span style={{ color: '#3b82f6' }}>({selectedIds.length}건)</span></Typography>
          </Box>
          {/* 버튼 행 — 모바일 가로 스크롤 (native div + inline style로 Tailwind 충돌 방지) */}
          <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', overflowX: 'auto', gap: '6px', paddingBottom: '2px' }}>
            <Button
              component="label"
              size="small"
              variant="outlined"
              startIcon={isUploadingScript ? <CircularProgress size={12} color="inherit" /> : <UploadFileIcon fontSize="small" />}
              disabled={isUploadingScript}
              sx={{ borderColor: 'rgba(255,255,255,0.2)', color: '#cbd5e1', fontWeight: 600, fontSize: '0.72rem', height: 32, minWidth: 'auto', px: 1.5, whiteSpace: 'nowrap', flexShrink: 0, '&:hover': { borderColor: '#f8fafc', bgcolor: 'rgba(255,255,255,0.05)' } }}
            >
              스크립트 엑셀 추가
              <input type="file" hidden accept=".xlsx, .xls, .csv" onChange={handleExcelUpload} />
            </Button>

            <Button
              size="small"
              variant="outlined"
              startIcon={isCollectingAll ? <CircularProgress size={12} color="inherit" /> : <CloudDownloadIcon fontSize="small" />}
              onClick={handleCollectAll}
              disabled={isCollectingAll}
              sx={{ borderColor: 'rgba(255,255,255,0.2)', color: '#cbd5e1', fontWeight: 600, fontSize: '0.72rem', height: 32, minWidth: 'auto', px: 1.5, whiteSpace: 'nowrap', flexShrink: 0, '&:hover': { borderColor: '#f8fafc', bgcolor: 'rgba(255,255,255,0.05)' } }}
            >
              새로 수집
            </Button>

            <Button
              size="small"
              variant="contained"
              startIcon={isGeneratingBulkAI ? <CircularProgress size={12} color="inherit" /> : <AutoAwesomeIcon fontSize="small" />}
              onClick={handleBulkGenerateAI}
              disabled={isGeneratingBulkAI || selectedIds.length === 0}
              sx={{ bgcolor: '#ec4899', color: '#fff', fontWeight: 600, fontSize: '0.72rem', height: 32, minWidth: 'auto', px: 1.5, whiteSpace: 'nowrap', flexShrink: 0, boxShadow: '0 4px 14px rgba(236, 72, 153, 0.4)', '&:hover': { bgcolor: '#db2777' }, '&.Mui-disabled': { bgcolor: 'rgba(236, 72, 153, 0.3)', color: '#fbcfe8' } }}
            >
              AI 답변 생성
            </Button>

            <Button
              size="small"
              variant="contained"
              startIcon={<SendIcon fontSize="small" />}
              onClick={handleBulkSubmit}
              disabled={isSubmitting || selectedIds.length === 0}
              sx={{ bgcolor: '#3b82f6', color: '#fff', fontWeight: 600, fontSize: '0.72rem', height: 32, minWidth: 'auto', px: 1.5, whiteSpace: 'nowrap', flexShrink: 0, boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)' }}
            >
              1. 답변저장
            </Button>

            <Button
              size="small"
              variant="contained"
              startIcon={isTriggeringBot ? <CircularProgress size={12} color="inherit" /> : <RocketLaunchIcon fontSize="small" />}
              onClick={handleTriggerBot}
              disabled={isTriggeringBot || selectedIds.length === 0}
              sx={{ bgcolor: '#8b5cf6', color: '#fff', fontWeight: 600, fontSize: '0.72rem', height: 32, minWidth: 'auto', px: 1.5, whiteSpace: 'nowrap', flexShrink: 0, '&:hover': { bgcolor: '#7c3aed' }, boxShadow: '0 4px 14px rgba(139, 92, 246, 0.4)' }}
            >
              2. 쇼핑몰 송신
            </Button>
          </div>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress sx={{ color: '#3b82f6' }} /></Box>
        ) : paginatedData.length > 0 ? (
          <Stack spacing={2} sx={{ mb: 4 }}>
            {paginatedData.map((group) => {
              const mainItem = group[0]; 
              const subItems = group.slice(1);
              const isMultiple = subItems.length > 0;
              const groupKey = (mainItem.order_number && mainItem.order_number.trim() !== '-' && mainItem.order_number.trim() !== '') ? mainItem.order_number : `single-${mainItem.id}`;
              const expanded = !!expandedGroups[groupKey];
              
              const isMainSelected = selectedIds.includes(mainItem.id);
              const standardChannel = getStandardChannelName(mainItem.channel);
              const mainStatusColor = getStatusColor(mainItem.status);
              const channelAdminUrl = getChannelUrl(standardChannel);

              const isCompletedMain = mainItem.status === '처리완료';

              return (
                <Card key={groupKey} elevation={0} sx={{ 
                  bgcolor: isMainSelected ? 'rgba(59, 130, 246, 0.05)' : (isCompletedMain ? 'rgba(255, 255, 255, 0.03)' : 'rgba(30, 41, 59, 0.4)'), 
                  border: `1px solid ${isMainSelected ? '#3b82f6' : (isCompletedMain ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.05)')}`, 
                  borderRadius: '12px', transition: '0.2s', 
                  '&:hover': { borderColor: isMainSelected ? '#3b82f6' : 'rgba(255,255,255,0.2)' } 
                }}>
                  <CardContent sx={{ p: { xs: '12px !important', md: '16px !important' } }}>

                    <Box sx={{ display: 'flex', gap: { xs: 1, md: 1.5 } }}>
                      <Box sx={{ pt: 0.5 }}>
                        <Checkbox checked={isMainSelected} onChange={() => handleClick(mainItem.id)} sx={{ color: '#64748b', '&.Mui-checked': { color: '#3b82f6' }, p: 0.5 }} />
                      </Box>
                      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0 }}>

                        {/* ── 좌측: 문의 정보 + 내용 ── */}
                        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0, overflow: 'hidden' }}>

                        {/* 헤더행: 고객명 + 날짜 */}
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                          <Box sx={{ flex: 1, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, gap: { xs: 0.5, sm: 1.5 }, flexWrap: 'wrap', minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 700, color: '#f8fafc', fontSize: { xs: '0.9rem', md: '1rem' }, flexShrink: 0 }}>
                              {mainItem.customer_name}
                            </Typography>

                            {/* 주문번호 — 모바일: 말줄임, 클릭 시 상세 */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, maxWidth: '100%' }}>
                              <Typography sx={{ color: '#64748b', fontSize: '0.75rem', flexShrink: 0 }}>주문번호</Typography>
                              {mainItem.order_number && mainItem.order_number !== '-' ? (
                                <MuiLink
                                  component="button"
                                  onClick={() => setOrderModalData(mainItem)}
                                  sx={{
                                    color: '#3b82f6', fontWeight: 600, textDecoration: 'none', fontSize: '0.75rem',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    maxWidth: { xs: '160px', sm: 'none' },
                                    display: 'inline-block',
                                    '&:hover': { textDecoration: 'underline', cursor: 'pointer' },
                                    background: 'none', border: 'none', font: 'inherit',
                                  }}
                                >
                                  {mainItem.order_number}
                                </MuiLink>
                              ) : (
                                <Typography sx={{ color: '#475569', fontSize: '0.75rem' }}>-</Typography>
                              )}
                            </Box>

                            {mainItem.product_name && mainItem.product_name !== '-' && (
                              <Typography sx={{
                                color: '#cbd5e1', fontWeight: 500, fontSize: '0.75rem',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                maxWidth: { xs: '200px', sm: 'none' },
                              }}>
                                {mainItem.product_name}
                              </Typography>
                            )}

                            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
                              <Chip 
                                component="a"
                                href={channelAdminUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                clickable={channelAdminUrl !== '#'}
                                label={standardChannel} 
                                size="small" 
                                sx={{ 
                                  bgcolor: 'rgba(255,255,255,0.1)', color: '#f8fafc', fontWeight: 600, borderRadius: '4px', height: '22px', fontSize: '0.7rem',
                                  textDecoration: 'none',
                                  '&:hover': channelAdminUrl !== '#' ? { bgcolor: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', cursor: 'pointer' } : {}
                                }} 
                              />
                              <Chip label={mainItem.status} size="small" sx={{ bgcolor: mainStatusColor.bg, color: mainStatusColor.color, fontWeight: 700, borderRadius: '4px', height: '22px', fontSize: '0.7rem' }} />
                              
                              <Button
                                size="small"
                                disabled={isSavingSheet[mainItem.id]}
                                onClick={() => handleSaveToSheet(mainItem)}
                                startIcon={isSavingSheet[mainItem.id] ? <CircularProgress size={10} color="inherit" /> : <CloudDownloadIcon sx={{ fontSize: 14 }} />}
                                sx={{
                                  bgcolor: 'rgba(16, 185, 129, 0.1)', color: '#34d399',
                                  fontWeight: 600, fontSize: '0.65rem', height: '22px', py: 0, px: 1,
                                  borderRadius: '4px',
                                  '&:hover': { bgcolor: 'rgba(16, 185, 129, 0.2)' },
                                  '&.Mui-disabled': { opacity: 0.5, color: '#34d399' }
                                }}
                              >
                                {isSavingSheet[mainItem.id] ? '저장 중...' : '시트 저장'}
                              </Button>

                              <Button
                                size="small"
                                disabled={isRefetchingOrder[mainItem.id]}
                                onClick={() => handleRefetchOrder(mainItem)}
                                startIcon={isRefetchingOrder[mainItem.id] ? <CircularProgress size={10} color="inherit" /> : <LaunchIcon sx={{ fontSize: 14 }} />}
                                sx={{
                                  bgcolor: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa',
                                  fontWeight: 600, fontSize: '0.65rem', height: '22px', py: 0, px: 1,
                                  borderRadius: '4px',
                                  '&:hover': { bgcolor: 'rgba(59, 130, 246, 0.2)' },
                                  '&.Mui-disabled': { opacity: 0.5, color: '#60a5fa' }
                                }}
                                title="사방넷에서 주문 상품/배송 정보 다시 가져오기"
                              >
                                {isRefetchingOrder[mainItem.id] ? '조회 중...' : '상품정보'}
                              </Button>
                            </Stack>
                          </Box>

                          <Typography sx={{ color: '#64748b', fontSize: '0.7rem', flexShrink: 0, whiteSpace: 'nowrap', pt: '2px' }}>
                            {getDisplayTime(mainItem.inquiry_date, mainItem.collected_at)}
                          </Typography>
                        </Box>
                        
                        {(mainItem.receiver_name || mainItem.receiver_tel || mainItem.tracking_number || mainItem.shipping_address) && (
                          <Box sx={{
                            p: 1, px: 1.5,
                            bgcolor: 'rgba(15, 23, 42, 0.4)',
                            borderRadius: '8px',
                            border: '1px solid rgba(59, 130, 246, 0.1)',
                            display: 'flex',
                            flexDirection: { xs: 'column', sm: 'row' },
                            flexWrap: { sm: 'wrap' },
                            alignItems: { sm: 'center' },
                            gap: { xs: 0.8, sm: 2 },
                          }}>
                            {mainItem.receiver_name && (
                              <Typography sx={{ color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem' }}>
                                <PersonIcon sx={{ fontSize: 13, color: '#94a3b8', flexShrink: 0 }} />
                                <span style={{ fontWeight: 600, color: '#f8fafc' }}>수령인 : {mainItem.receiver_name}</span>
                              </Typography>
                            )}
                            {mainItem.receiver_name && mainItem.receiver_tel && (
                              <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.1)', height: '14px', my: 'auto', display: { xs: 'none', sm: 'block' } }} />
                            )}
                            {mainItem.receiver_tel && (
                              <Typography sx={{ color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem' }}>
                                <PhoneIcon sx={{ fontSize: 13, color: '#94a3b8', flexShrink: 0 }} />
                                <span style={{ fontWeight: 600, color: '#f8fafc' }}>연락처 : {mainItem.receiver_tel}</span>
                              </Typography>
                            )}
                            {mainItem.receiver_tel && mainItem.shipping_address && (
                              <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.1)', height: '14px', my: 'auto', display: { xs: 'none', sm: 'block' } }} />
                            )}
                            {mainItem.shipping_address && (
                              <Typography sx={{ color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', overflowWrap: 'break-word', wordBreak: 'break-all' }}>
                                <HomeIcon sx={{ fontSize: 13, color: '#94a3b8', flexShrink: 0 }} />
                                <span style={{ color: '#f8fafc' }}>주소 : {mainItem.shipping_address}</span>
                              </Typography>
                            )}
                            {mainItem.shipping_address && mainItem.tracking_number && (
                              <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.1)', height: '14px', my: 'auto', display: { xs: 'none', sm: 'block' } }} />
                            )}
                            {mainItem.tracking_number && (
                              <Typography sx={{ color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem' }}>
                                <LocalShippingIcon sx={{ fontSize: 13, color: '#10b981', flexShrink: 0 }} />
                                <MuiLink
                                  component="button"
                                  onClick={async () => {
                                    const tNum = mainItem.tracking_number || '';
                                    const tUrl = getTrackingUrl(mainItem.channel, tNum);
                                    const ch = mainItem.channel;
                                    setTrackingModalData({ channel: ch, trackingNumber: tNum, trackingUrl: tUrl });
                                    setTrackingResult(null);
                                    setTrackingLoading(true);
                                    try {
                                      const stdCh = getStandardChannelName(ch);
                                      const carrier = (stdCh === '네이버' || stdCh === '이베이') ? 'cj' : 'lotte';
                                      const res = await fetch(`/api/tracking?carrier=${carrier}&num=${tNum.replace(/\D/g, '')}`);
                                      const data = await res.json();
                                      if (!data.error) setTrackingResult(data);
                                    } catch {} finally { setTrackingLoading(false); }
                                  }}
                                  sx={{
                                    fontWeight: 700, color: '#10b981', textDecoration: 'none', fontSize: '0.75rem',
                                    '&:hover': { textDecoration: 'underline', cursor: 'pointer' },
                                    background: 'none', border: 'none', font: 'inherit',
                                    overflowWrap: 'break-word', wordBreak: 'break-all',
                                  }}
                                >
                                  {formatTrackingNumber(mainItem.tracking_number)}
                                </MuiLink>
                              </Typography>
                            )}
                          </Box>
                        )}

                        {/* 확정옵션 요약 (상세는 클릭 시 모달에서 확인) */}
                        {Array.isArray(mainItem.order_items) && mainItem.order_items.length > 0 && mainItem.order_items.some((it) => it.unitName) && (
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            {mainItem.order_items.filter((it) => !it.gift && it.unitName).map((it, idx) => (
                              <Chip
                                key={idx}
                                size="small"
                                label={`${it.unitName} ${it.qty || 1}EA(확정)`}
                                sx={{ height: 20, fontSize: '0.68rem', fontWeight: 600, bgcolor: 'rgba(168, 85, 247, 0.15)', color: '#e9d5ff', borderRadius: '4px' }}
                              />
                            ))}
                          </Box>
                        )}

                        <Box sx={{ bgcolor: 'rgba(15, 23, 42, 0.6)', p: { xs: 1, md: 1.5 }, borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                          <Box
                            onClick={() => setExpandedContent(prev => ({ ...prev, [mainItem.id]: !prev[mainItem.id] }))}
                            sx={{
                              overflow: 'hidden',
                              maxHeight: { xs: expandedContent[mainItem.id] ? 'none' : '4.8em', md: 'none' },
                              cursor: { xs: 'pointer', md: 'default' },
                            }}
                          >
                            <Typography sx={{
                              color: '#cbd5e1', whiteSpace: 'pre-wrap', lineHeight: 1.6,
                              fontSize: { xs: '0.82rem', md: '0.875rem' },
                              overflowWrap: 'break-word', wordBreak: 'break-word',
                            }}>
                              {renderContent(mainItem.content)}
                            </Typography>
                          </Box>
                          {/* 모바일 더보기 버튼 */}
                          {!expandedContent[mainItem.id] && (mainItem.content?.length ?? 0) > 80 && (
                            <Typography
                              onClick={() => setExpandedContent(prev => ({ ...prev, [mainItem.id]: true }))}
                              sx={{ display: { xs: 'block', md: 'none' }, mt: 0.5, color: '#3b82f6', fontSize: '0.75rem', cursor: 'pointer' }}
                            >
                              더 보기 ▾
                            </Typography>
                          )}
                          {expandedContent[mainItem.id] && (
                            <Typography
                              onClick={() => setExpandedContent(prev => ({ ...prev, [mainItem.id]: false }))}
                              sx={{ display: { xs: 'block', md: 'none' }, mt: 0.5, color: '#64748b', fontSize: '0.75rem', cursor: 'pointer' }}
                            >
                              접기 ▴
                            </Typography>
                          )}
                        </Box>

                        </Box>{/* ── 좌측 열 끝 ── */}

                        {/* ── 하단: 답변 입력 ── */}
                        <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 1 }}>

                        {/* 답변 입력 + 액션 버튼 */}
                        <Box>
                          {/* PC: 버튼 absolute / 모바일: 버튼 분리 행 */}
                          <Box sx={{ position: 'relative' }}>
                            <TextField
                              multiline fullWidth minRows={2} maxRows={6} size="small"
                              value={replyTexts[mainItem.id] !== undefined ? replyTexts[mainItem.id] : ''}
                              onChange={(e) => handleReplyChange(mainItem.id, e.target.value)}
                              placeholder={isCompletedMain ? "처리 완료된 문의입니다." : "답변 작성"}
                              disabled={isCompletedMain}
                              sx={{
                                '& .MuiOutlinedInput-root': {
                                  bgcolor: 'rgba(15, 23, 42, 0.8)', color: '#f8fafc', borderRadius: '8px',
                                  fontSize: { xs: '0.82rem', md: '0.85rem' },
                                  p: 1.5,
                                  pr: { xs: 1.5, lg: 20 },
                                  '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                                  '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                                  '&.Mui-focused fieldset': { borderColor: '#3b82f6' },
                                  '&.Mui-disabled': { bgcolor: 'rgba(255, 255, 255, 0.05)' },
                                  '& .MuiInputBase-input.Mui-disabled': {
                                    WebkitTextFillColor: '#ffffff !important',
                                    color: '#ffffff !important',
                                    opacity: 1,
                                  }
                                }
                              }}
                            />
                            {/* PC 전용 절대위치 버튼 */}
                            <Stack direction="row" spacing={1} sx={{ position: 'absolute', right: 8, bottom: 8, display: { xs: 'none', lg: 'flex' } }}>
                              {!isCompletedMain && (
                                <Button size="small" onClick={() => handleForceComplete(mainItem.id)}
                                  startIcon={<CheckCircleIcon sx={{ fontSize: 16 }} />}
                                  sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 600, fontSize: '0.7rem', height: '24px', py: 0, px: 1, borderRadius: '6px', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
                                  강제 완료
                                </Button>
                              )}
                              <Button size="small" variant="contained"
                                disabled={isGeneratingAI[mainItem.id] || isCompletedMain}
                                onClick={() => handleGenerateAI(mainItem.id)}
                                startIcon={isGeneratingAI[mainItem.id] ? <CircularProgress size={12} color="inherit" /> : <SmartToyIcon sx={{ fontSize: 16 }} />}
                                sx={{ bgcolor: 'rgba(139,92,246,0.2)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)', fontWeight: 600, fontSize: '0.7rem', height: '24px', py: 0, px: 1, borderRadius: '6px', '&:hover': { bgcolor: 'rgba(139,92,246,0.4)' }, '&.Mui-disabled': { bgcolor: 'transparent', color: 'transparent', borderColor: 'transparent' } }}>
                                {isGeneratingAI[mainItem.id] ? '생성 중...' : 'AI 답변'}
                              </Button>
                            </Stack>
                          </Box>

                          {/* 모바일 전용 버튼 행 */}
                          {!isCompletedMain && (
                            <Stack direction="row" spacing={1} sx={{ mt: 1, display: { xs: 'flex', lg: 'none' } }}>
                              <Button fullWidth size="small" onClick={() => handleForceComplete(mainItem.id)}
                                startIcon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                                sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 600, fontSize: '0.78rem', height: '34px', borderRadius: '8px', '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}>
                                강제 완료
                              </Button>
                              <Button fullWidth size="small" variant="contained"
                                disabled={isGeneratingAI[mainItem.id]}
                                onClick={() => handleGenerateAI(mainItem.id)}
                                startIcon={isGeneratingAI[mainItem.id] ? <CircularProgress size={12} color="inherit" /> : <SmartToyIcon sx={{ fontSize: 14 }} />}
                                sx={{ bgcolor: 'rgba(139,92,246,0.2)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)', fontWeight: 600, fontSize: '0.78rem', height: '34px', borderRadius: '8px', '&:hover': { bgcolor: 'rgba(139,92,246,0.4)' }, '&.Mui-disabled': { opacity: 0.4 } }}>
                                {isGeneratingAI[mainItem.id] ? '생성 중...' : 'AI 답변'}
                              </Button>
                            </Stack>
                          )}
                        </Box>
                        
                        {mainItem.ai_draft && !mainItem.admin_reply && (
                          <Typography variant="caption" sx={{ color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: 0.5, mt: -1 }}>
                            <AutoAwesomeIcon sx={{ fontSize: 12 }} /> AI 작성 초안
                          </Typography>
                        )}

                        </Box>{/* ── 우측 열 끝 ── */}

                      </Box>{/* ── 2열 flex 끝 ── */}
                    </Box>{/* ── checkbox + content flex 끝 ── */}

                    {isMultiple && (
                          <Box sx={{ mt: 1, textAlign: 'center' }}>
                            <Button
                              onClick={() => toggleGroup(groupKey)}
                              endIcon={expanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                              sx={{ color: '#94a3b8', fontSize: '0.8rem', bgcolor: 'rgba(255,255,255,0.02)', borderRadius: '20px', px: 3, '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' } }}
                            >
                              이전 묶음 문의 {subItems.length}건 {expanded ? '접기' : '펼쳐보기'}
                            </Button>
                          </Box>
                        )}

                        <Collapse in={expanded} timeout="auto" unmountOnExit>
                          <Box sx={{ mt: 1, pt: 2, borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                            <Stack spacing={2} sx={{ pl: 2, borderLeft: '2px solid rgba(59, 130, 246, 0.3)' }}>
                              {subItems.map(subItem => {
                                const isSubSelected = selectedIds.includes(subItem.id);
                                const subStatusColor = getStatusColor(subItem.status);
                                const subChannelAdminUrl = getChannelUrl(getStandardChannelName(subItem.channel)); 
                                const isCompletedSub = subItem.status === '처리완료'; 

                                return (
                                  <Box key={subItem.id} sx={{ display: 'flex', gap: 1.5, opacity: isCompletedSub ? 0.7 : 1 }}>
                                    <Box sx={{ pt: 0.5 }}>
                                      <Checkbox size="small" checked={isSubSelected} onChange={() => handleClick(subItem.id)} sx={{ color: '#64748b', '&.Mui-checked': { color: '#3b82f6' }, p: 0 }} />
                                    </Box>
                                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
                                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        
                                        <Stack direction="row" spacing={1} alignItems="center">
                                          <Chip label={subItem.status} size="small" sx={{ bgcolor: subStatusColor.bg, color: subStatusColor.color, fontWeight: 700, borderRadius: '4px', height: '20px', fontSize: '0.7rem' }} />
                                          <Button
                                            size="small"
                                            disabled={isSavingSheet[subItem.id]}
                                            onClick={() => handleSaveToSheet(subItem)}
                                            startIcon={isSavingSheet[subItem.id] ? <CircularProgress size={10} color="inherit" /> : <CloudDownloadIcon sx={{ fontSize: 14 }} />}
                                            sx={{
                                              bgcolor: 'rgba(16, 185, 129, 0.1)', color: '#34d399',
                                              fontWeight: 600, fontSize: '0.65rem', height: '20px', py: 0, px: 1,
                                              borderRadius: '4px',
                                              '&:hover': { bgcolor: 'rgba(16, 185, 129, 0.2)' },
                                              '&.Mui-disabled': { opacity: 0.5, color: '#34d399' }
                                            }}
                                          >
                                            {isSavingSheet[subItem.id] ? '저장 중...' : '시트 저장'}
                                          </Button>
                                        </Stack>

                                        <Typography variant="caption" sx={{ color: '#64748b' }}>
                                          {getDisplayTime(subItem.inquiry_date, subItem.collected_at)}
                                        </Typography>
                                      </Box>
                                      <Box sx={{ bgcolor: 'rgba(15, 23, 42, 0.3)', p: 1.5, borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                                        <Typography variant="body2" sx={{ color: '#94a3b8', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{subItem.content}</Typography>
                                      </Box>
                                      <Box sx={{ position: 'relative' }}>
                                        <TextField 
                                          fullWidth minRows={1} maxRows={4} size="small" 
                                          value={replyTexts[subItem.id] !== undefined ? replyTexts[subItem.id] : ''} 
                                          onChange={(e) => handleReplyChange(subItem.id, e.target.value)} 
                                          placeholder={isCompletedSub ? "처리 완료된 문의입니다." : "답변 작성"}
                                          disabled={isCompletedSub}
                                          sx={{ 
                                            '& .MuiOutlinedInput-root': { 
                                              bgcolor: 'rgba(15, 23, 42, 0.4)', color: '#94a3b8', borderRadius: '8px', fontSize: '0.8rem', p: 1, pr: 16,
                                              '& fieldset': { borderColor: 'rgba(255,255,255,0.05)' },
                                              '&.Mui-disabled': { bgcolor: 'rgba(255, 255, 255, 0.05)' },
                                              '& .MuiInputBase-input.Mui-disabled': {
                                                WebkitTextFillColor: '#ffffff !important',
                                                color: '#ffffff !important',
                                                opacity: 1,
                                              }
                                            } 
                                          }} 
                                        />
                                        
                                        <Stack direction="row" spacing={0.5} sx={{ position: 'absolute', right: 4, bottom: 4 }}>
                                          {!isCompletedSub && (
                                            <Button
                                              size="small"
                                              onClick={() => handleForceComplete(subItem.id)}
                                              sx={{
                                                bgcolor: 'rgba(255, 255, 255, 0.05)', color: '#cbd5e1',
                                                fontWeight: 600, fontSize: '0.65rem', height: '20px', py: 0, px: 1,
                                                borderRadius: '4px',
                                                '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' }
                                              }}
                                            >
                                              강제 완료
                                            </Button>
                                          )}
                                          <Button
                                            size="small"
                                            disabled={isGeneratingAI[subItem.id] || isCompletedSub}
                                            onClick={() => handleGenerateAI(subItem.id)}
                                            startIcon={isGeneratingAI[subItem.id] ? <CircularProgress size={10} color="inherit" /> : <SmartToyIcon sx={{ fontSize: 14 }} />}
                                            sx={{
                                              bgcolor: 'rgba(139, 92, 246, 0.1)', color: '#a78bfa',
                                              fontWeight: 600, fontSize: '0.65rem', height: '20px', py: 0, px: 1,
                                              borderRadius: '4px',
                                              '&:hover': { bgcolor: 'rgba(139, 92, 246, 0.3)' },
                                              '&.Mui-disabled': { bgcolor: 'transparent', color: 'transparent', borderColor: 'transparent' }
                                            }}
                                          >
                                            AI 답변
                                          </Button>
                                        </Stack>
                                      </Box>
                                    </Box>
                                  </Box>
                                )
                              })}
                            </Stack>
                          </Box>
                    </Collapse>

                  </CardContent>
                </Card>
              );
            })}
          </Stack>
        ) : (
          <Box sx={{ textAlign: 'center', py: 10, bgcolor: 'rgba(30, 41, 59, 0.4)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <Typography variant="body1" sx={{ color: '#64748b' }}>조건에 맞는 문의 내역이 없습니다.</Typography>
          </Box>
        )}

        {groupedData.length > 0 && (
          <TablePagination component="div" count={groupedData.length} page={page} onPageChange={(e, newPage) => setPage(newPage)} rowsPerPage={rowsPerPage} onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }} rowsPerPageOptions={[5, 10, 25, 50]} labelRowsPerPage="페이지당 문의 그룹 수:" sx={{ color: '#94a3b8', borderTop: '1px solid rgba(255,255,255,0.1)', mt: 2 }} />
        )}

      </Container>

      {/* 주문 상세 모달 */}
      <Dialog open={!!orderModalData} onClose={() => setOrderModalData(null)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { bgcolor: '#1e293b', color: '#f8fafc', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', width: { sm: '560px' }, mx: { xs: 2, sm: 'auto' } } }}>
        <DialogTitle sx={{ fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)', pb: 2, px: 3 }}>
          주문 상세 정보
        </DialogTitle>
        <DialogContent sx={{ pt: '20px !important', px: 3 }}>
          {orderModalData && (
            <Box sx={{ display: 'grid', gridTemplateColumns: '88px 1fr', rowGap: 2, columnGap: 2 }}>
              {[
                { label: '주문번호', value: orderModalData.order_number, copy: orderModalData.order_number, copyable: true },
                { label: '상품명',   value: orderModalData.product_name, copy: '', copyable: false },
                { label: '고객명',   value: orderModalData.customer_name, copy: orderModalData.customer_name, copyable: true },
                { label: '수령인',   value: orderModalData.receiver_name, copy: orderModalData.receiver_name, copyable: true },
                { label: '연락처',   value: orderModalData.receiver_tel, copy: orderModalData.receiver_tel, copyable: true },
                { label: '배송주소', value: orderModalData.shipping_address, copy: orderModalData.shipping_address, copyable: true },
                {
                  label: '송장번호',
                  value: orderModalData.tracking_number ? formatTrackingNumber(orderModalData.tracking_number) : '-',
                  copy: orderModalData.tracking_number ? formatTrackingNumber(orderModalData.tracking_number) : '',
                  copyable: true,
                },
                { label: '쇼핑몰',   value: getStandardChannelName(orderModalData.channel), copy: '', copyable: false },
              ].map(({ label, value, copy, copyable }) => {
                const key = `modal-${label}`;
                const canCopy = copyable && !!(copy && copy !== '-');
                return (
                  <React.Fragment key={`row-${label}`}>
                    <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', pt: '2px' }}>{label}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ color: '#f8fafc', wordBreak: 'break-all', fontSize: '0.875rem', flex: 1, minWidth: 0 }}>
                        {value || '-'}
                      </Typography>
                      {canCopy && (
                        <IconButton
                          size="small"
                          onClick={() => copyToClipboard(String(copy), key)}
                          title={`${label} 복사`}
                          sx={{
                            flexShrink: 0,
                            p: 0.4,
                            color: copiedKey === key ? '#34d399' : '#64748b',
                            '&:hover': { color: '#60a5fa', bgcolor: 'rgba(59, 130, 246, 0.1)' },
                          }}
                        >
                          {copiedKey === key
                            ? <CheckIcon sx={{ fontSize: 14 }} />
                            : <ContentCopyIcon sx={{ fontSize: 14 }} />}
                        </IconButton>
                      )}
                    </Box>
                  </React.Fragment>
                );
              })}

              {/* 사방넷 주문 상품 목록 */}
              {Array.isArray(orderModalData.order_items) && orderModalData.order_items.length > 0 && (
                <React.Fragment>
                  <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', pt: '2px' }}>주문상품</Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8 }}>
                    {orderModalData.order_items.map((it, idx) => (
                      <Box key={idx} sx={{
                        p: 1, borderRadius: '6px',
                        bgcolor: it.gift ? 'rgba(251, 191, 36, 0.06)' : 'rgba(15, 23, 42, 0.5)',
                        border: it.gift ? '1px dashed rgba(251, 191, 36, 0.3)' : '1px solid rgba(255,255,255,0.05)',
                      }}>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.5 }}>
                          {it.mallProductId && (
                            <Chip
                              size="small" label={`쇼핑몰 ${it.mallProductId}`}
                              sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'rgba(255,255,255,0.06)', color: '#cbd5e1' }}
                            />
                          )}
                          {it.gift && <Chip size="small" label="🎁 사은품" sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'rgba(251,191,36,0.2)', color: '#fbbf24', fontWeight: 700 }} />}
                          <Chip size="small" label={`× ${it.qty || 1}`} sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'rgba(59,130,246,0.15)', color: '#60a5fa', fontWeight: 700 }} />
                        </Box>

                        {(it.productName || it.giftName) && (
                          <Typography sx={{ color: '#f1f5f9', fontSize: '0.82rem', fontWeight: 500, wordBreak: 'break-word' }}>
                            {it.giftName || it.productName}
                          </Typography>
                        )}
                        {it.option && (
                          <Typography sx={{ color: '#94a3b8', fontSize: '0.72rem', mt: 0.3 }}>옵션: {it.option}</Typography>
                        )}
                        {it.unitName && (
                          <Typography sx={{ color: '#a78bfa', fontSize: '0.74rem', fontWeight: 500 }}>
                            ✓ 확정옵션: <span style={{ color: '#e9d5ff' }}>{it.unitName}</span>
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Box>
                </React.Fragment>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ borderTop: '1px solid rgba(255,255,255,0.08)', p: 2, px: 3, gap: 1 }}>
          <Button onClick={() => { if (orderModalData) window.open(getSabangnetOrderUrl(orderModalData.order_number), '_blank'); }}
            variant="outlined" size="small" startIcon={<LaunchIcon sx={{ fontSize: 14 }} />}
            sx={{ color: '#3b82f6', borderColor: 'rgba(59,130,246,0.4)', '&:hover': { borderColor: '#3b82f6' } }}>
            사방넷에서 열기
          </Button>
          <Button onClick={() => setOrderModalData(null)} variant="contained" size="small" sx={{ bgcolor: '#3b82f6', '&:hover': { bgcolor: '#2563eb' } }}>
            닫기
          </Button>
        </DialogActions>
      </Dialog>

      {/* 배송 추적 모달 */}
      <Dialog open={!!trackingModalData} onClose={() => { setTrackingModalData(null); setTrackingResult(null); }} maxWidth="sm" fullWidth
        PaperProps={{ sx: { bgcolor: '#1e293b', color: '#f8fafc', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '85vh', width: { sm: '520px' }, mx: { xs: 2, sm: 'auto' } } }}>
        <DialogTitle sx={{ fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.08)', py: 1.5, px: 2.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <LocalShippingIcon sx={{ color: '#10b981', fontSize: 20 }} />
              <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: '#f8fafc' }}>배송 추적</Typography>
            </Box>
            <IconButton onClick={() => { setTrackingModalData(null); setTrackingResult(null); }} size="small"
              sx={{ color: '#64748b', '&:hover': { color: '#f8fafc', bgcolor: 'rgba(255,255,255,0.08)' } }}>
              <Typography sx={{ fontSize: '1rem', lineHeight: 1 }}>✕</Typography>
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ pt: '20px !important', pb: 2.5, px: 2.5 }}>
          {trackingModalData && (
            <Stack spacing={2.5}>

              {/* ── 헤더 블록: 택배사 + 송장번호 + 현재 상태 ── */}
              <Box sx={{ bgcolor: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.18)', borderRadius: '12px', p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px' }}>
                    {trackingResult?.carrier || (getStandardChannelName(trackingModalData.channel) === '네이버' || getStandardChannelName(trackingModalData.channel) === '이베이' ? 'CJ대한통운' : '롯데택배')}
                  </Typography>
                  {trackingResult && (
                    <Chip
                      label={trackingResult.currentStatus} size="small"
                      sx={{
                        bgcolor: trackingResult.currentStatus === '배달완료' ? 'rgba(16,185,129,0.2)' : 'rgba(59,130,246,0.15)',
                        color: trackingResult.currentStatus === '배달완료' ? '#10b981' : '#60a5fa',
                        fontWeight: 700, fontSize: '0.72rem', height: 22, border: `1px solid ${trackingResult.currentStatus === '배달완료' ? 'rgba(16,185,129,0.3)' : 'rgba(59,130,246,0.3)'}`
                      }}
                    />
                  )}
                </Box>
                <Typography sx={{ fontFamily: 'monospace', fontSize: '1.25rem', fontWeight: 800, color: '#10b981', letterSpacing: '2px', lineHeight: 1.3 }}>
                  {formatTrackingNumber(trackingModalData.trackingNumber)}
                </Typography>
              </Box>

              {/* ── 배송 이력 타임라인 ── */}
              {trackingLoading ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <CircularProgress size={28} sx={{ color: '#10b981' }} />
                  <Typography sx={{ mt: 1.5, fontSize: '0.78rem', color: '#64748b' }}>배송 정보 조회 중...</Typography>
                </Box>
              ) : trackingResult && trackingResult.steps.length > 0 ? (
                <Box sx={{ maxHeight: '350px', overflow: 'auto', '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.2)', borderRadius: 2 } }}>
                  <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600, mb: 1, display: 'block' }}>배송 이력</Typography>
                  {trackingResult.steps.map((step: any, idx: number) => (
                    <Box key={idx} sx={{ display: 'flex', gap: 1.5, py: 1.2, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <Box sx={{ minWidth: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 0.3 }}>
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: idx === 0 ? '#10b981' : '#475569', flexShrink: 0 }} />
                        {idx < trackingResult.steps.length - 1 && (
                          <Box sx={{ width: 1, flex: 1, bgcolor: 'rgba(255,255,255,0.1)', mt: 0.5 }} />
                        )}
                      </Box>
                      <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="body2" sx={{ color: idx === 0 ? '#10b981' : '#e2e8f0', fontWeight: idx === 0 ? 700 : 500, fontSize: '0.82rem' }}>
                            {step.step || step.status}
                          </Typography>
                          <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.7rem', flexShrink: 0, ml: 1 }}>
                            {step.location}
                          </Typography>
                        </Box>
                        <Typography variant="caption" sx={{ color: '#64748b', fontSize: '0.7rem' }}>
                          {step.date}
                        </Typography>
                        {step.detail && (
                          <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.72rem', display: 'block', mt: 0.3 }}>
                            {step.detail}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  ))}
                </Box>
              ) : !trackingLoading ? (
                <Box sx={{ textAlign: 'center', py: 3 }}>
                  <Typography sx={{ fontSize: '0.8rem', color: '#475569' }}>배송 정보를 불러올 수 없습니다.</Typography>
                </Box>
              ) : null}

              {/* ── 택배사 사이트 버튼 ── */}
              <Button
                fullWidth variant="outlined" size="small"
                onClick={() => window.open(trackingModalData.trackingUrl, '_blank')}
                startIcon={<LaunchIcon sx={{ fontSize: '14px !important' }} />}
                sx={{
                  color: '#64748b', borderColor: 'rgba(255,255,255,0.08)', fontSize: '0.75rem', py: 0.9,
                  '&:hover': { borderColor: 'rgba(255,255,255,0.2)', color: '#94a3b8', bgcolor: 'rgba(255,255,255,0.03)' }
                }}
              >
                택배사 사이트에서 보기
              </Button>
            </Stack>
          )}
        </DialogContent>
      </Dialog>

    </Box>
  );
}