export type InputType = 'text' | 'url' | 'document';
export type ReportStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type Assessment = 'supported' | 'contradicted' | 'partially_supported' | 'insufficient';
export type EvidenceStance = 'supports' | 'contradicts' | 'neutral';
export type EvidenceRelevance = 'high' | 'medium' | 'low';
export type LanguageCode = 'en' | 'ar' | 'es' | 'fr' | 'de' | 'hi';

export interface VerificationReport {
  id: string;
  user_id: string | null;
  is_guest: boolean;
  input_type: InputType;
  input_title: string | null;
  input_excerpt: string | null;
  status: ReportStatus;
  language: string;
  overall_summary: string | null;
  total_claims: number;
  supported_count: number;
  contradicted_count: number;
  partial_count: number;
  insufficient_count: number;
  overall_confidence: number | null;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
}

export interface ExtractedClaim {
  id: string;
  report_id: string;
  claim_text: string;
  context: string | null;
  claim_order: number;
  created_at: string;
}

export interface EvidenceSource {
  id: string;
  claim_id: string;
  source_title: string;
  source_url: string;
  publisher: string | null;
  publication_date: string | null;
  excerpt: string;
  retrieval_date: string;
  relevance: EvidenceRelevance;
  stance: EvidenceStance;
  source_type: string | null;
  created_at: string;
}

export interface ClaimAssessment {
  id: string;
  claim_id: string;
  assessment: Assessment;
  explanation: string;
  confidence: number;
  created_at: string;
}

export interface ClaimWithDetails extends ExtractedClaim {
  assessment: ClaimAssessment | null;
  evidence: EvidenceSource[];
}

export interface ReportWithDetails extends VerificationReport {
  claims: ClaimWithDetails[];
}

export interface UserProfile {
  id: string;
  display_name: string | null;
  created_at: string;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  language: LanguageCode;
  email_notifications: boolean;
}

export interface VerificationRequest {
  inputType: InputType;
  text?: string;
  url?: string;
  fileName?: string;
  fileContent?: string;
  language?: LanguageCode;
}

// ============================================================
// Media Intelligence types
// ============================================================

export type MediaType = 'image' | 'video';
export type MediaInputMethod = 'upload' | 'url';
export type MediaStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type MediaClassification =
  | 'likely_authentic'
  | 'likely_ai_generated'
  | 'likely_manipulated'
  | 'misleading_context'
  | 'inconclusive';

export type MediaMethod =
  | 'metadata'
  | 'exif'
  | 'c2pa'
  | 'dimensions'
  | 'compression'
  | 'visual_inconsistency'
  | 'ai_detection'
  | 'temporal_consistency'
  | 'av_sync'
  | 'provenance'
  | 'source_search';

export type MediaResultType = 'signal' | 'observation' | 'limitation' | 'unavailable';
export type MediaStance =
  | 'supports_authentic'
  | 'supports_ai'
  | 'supports_manipulation'
  | 'supports_misleading'
  | 'neutral';

export type MediaEvidenceRelationship =
  | 'earlier_appearance'
  | 'similar_content'
  | 'original_publication'
  | 'independent_report'
  | 'context';

export interface MediaInvestigation {
  id: string;
  user_id: string | null;
  is_guest: boolean;
  media_type: MediaType;
  input_method: MediaInputMethod;
  file_name: string | null;
  media_url: string | null;
  source_url: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  status: MediaStatus;
  final_classification: MediaClassification | null;
  overall_confidence: number | null;
  overall_summary: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface MediaFrame {
  id: string;
  investigation_id: string;
  frame_order: number;
  timestamp_seconds: number | null;
  storage_path: string;
  public_url: string;
  width: number | null;
  height: number | null;
  is_representative: boolean;
  created_at: string;
}

export interface MediaFinding {
  id: string;
  investigation_id: string;
  frame_id: string | null;
  method: MediaMethod;
  result_type: MediaResultType;
  label: string;
  detail: string;
  stance: MediaStance;
  confidence: number;
  raw_data: Record<string, unknown> | null;
  created_at: string;
}

export interface MediaEvidence {
  id: string;
  investigation_id: string;
  source_title: string;
  source_url: string;
  publisher: string | null;
  publication_date: string | null;
  excerpt: string;
  retrieval_date: string;
  relevance: EvidenceRelevance;
  relationship: MediaEvidenceRelationship;
  created_at: string;
}

export interface MediaInvestigationWithDetails extends MediaInvestigation {
  frames: MediaFrame[];
  findings: MediaFinding[];
  evidence: MediaEvidence[];
}
