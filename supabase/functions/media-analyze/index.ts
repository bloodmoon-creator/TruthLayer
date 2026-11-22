import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ============================================================
// Types (mirror frontend types)
// ============================================================

type MediaType = "image" | "video";
type MediaMethod =
  | "metadata" | "exif" | "c2pa" | "dimensions" | "compression"
  | "visual_inconsistency" | "ai_detection" | "temporal_consistency"
  | "av_sync" | "provenance" | "source_search";
type MediaResultType = "signal" | "observation" | "limitation" | "unavailable";
type MediaStance =
  | "supports_authentic" | "supports_ai" | "supports_manipulation"
  | "supports_misleading" | "neutral";
type MediaClassification =
  | "likely_authentic" | "likely_ai_generated" | "likely_manipulated"
  | "misleading_context" | "inconclusive";

interface FindingInput {
  method: MediaMethod;
  result_type: MediaResultType;
  label: string;
  detail: string;
  stance: MediaStance;
  confidence: number;
  frame_id?: string | null;
  raw_data?: Record<string, unknown> | null;
}

interface EvidenceInput {
  source_title: string;
  source_url: string;
  publisher: string | null;
  publication_date: string | null;
  excerpt: string;
  relevance: "high" | "medium" | "low";
  relationship: "earlier_appearance" | "similar_content" | "original_publication" | "independent_report" | "context";
}

interface FrameInput {
  frame_order: number;
  timestamp_seconds: number | null;
  storage_path: string;
  public_url: string;
  width: number | null;
  height: number | null;
  is_representative: boolean;
}

// ============================================================
// Image header parsing
// ============================================================

interface ImageInfo {
  format: string;
  width: number;
  height: number;
  exif: Record<string, string> | null;
  hasC2PA: boolean;
  c2paManifest: Record<string, unknown> | null;
}

function readUInt16BE(buf: Uint8Array, offset: number): number {
  return (buf[offset] << 8) | buf[offset + 1];
}

function readUInt32BE(buf: Uint8Array, offset: number): number {
  return ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0;
}

function parseJPEG(bytes: Uint8Array): { width: number; height: number; exif: Record<string, string> | null; hasC2PA: boolean } {
  let width = 0;
  let height = 0;
  let exif: Record<string, string> | null = null;
  let hasC2PA = false;

  let i = 0;
  // Verify SOI marker
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return { width, height, exif, hasC2PA };
  i = 2;

  while (i < bytes.length - 1) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const marker = bytes[i + 1];
    // Standalone markers (no length)
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    // SOS - start of scan, image data follows
    if (marker === 0xda) break;

    if (i + 3 >= bytes.length) break;
    const segLen = readUInt16BE(bytes, i + 2);

    // SOF0-SOF15 (0xC0-0xCF) contain dimensions
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (i + 8 < bytes.length) {
        height = readUInt16BE(bytes, i + 5);
        width = readUInt16BE(bytes, i + 7);
      }
    }

    // APP1 (0xE1) - EXIF
    if (marker === 0xe1) {
      const segStart = i + 4;
      const headerStr = String.fromCharCode(...bytes.slice(segStart, segStart + 6));
      if (headerStr.startsWith("Exif")) {
        exif = parseExif(bytes, segStart + 6, segLen - 8);
      }
    }

    // APP2 (0xE2) - C2PA manifest
    if (marker === 0xe2) {
      const segStart = i + 4;
      const signature = String.fromCharCode(...bytes.slice(segStart, segStart + 8));
      if (signature === "JPEG_C2P" || signature.startsWith("JPEG_C2PA")) {
        hasC2PA = true;
      }
    }

    i += 2 + segLen;
  }

  return { width, height, exif, hasC2PA };
}

function parseExif(bytes: Uint8Array, tiffStart: number, _maxLen: number): Record<string, string> | null {
  try {
    const byteOrder = bytes[tiffStart] === 0x49 && bytes[tiffStart + 1] === 0x49 ? "LE" : "BE";
    const isLE = byteOrder === "LE";
    const magic = isLE ? readUInt16LE(bytes, tiffStart + 2) : readUInt16BE(bytes, tiffStart + 2);
    if (magic !== 0x002a && magic !== 0x002b) return null;

    const read16 = (off: number) => isLE ? readUInt16LE(bytes, tiffStart + off) : readUInt16BE(bytes, tiffStart + off);
    const read32 = (off: number) => isLE ? readUInt32LE(bytes, tiffStart + off) : readUInt32BE(bytes, tiffStart + off);

    const ifdOffset = read32(4);
    const result: Record<string, string> = {};

    // Parse IFD0
    let entryCount = read16(ifdOffset);
    let entryOffset = ifdOffset + 2;

    for (let e = 0; e < entryCount && entryOffset + 12 <= bytes.length - tiffStart; e++) {
      const tag = read16(entryOffset);
      const type = read16(entryOffset + 2);
      const count = read32(entryOffset + 4);
      const valueOffset = entryOffset + 8;

      const value = readExifValue(bytes, tiffStart, tag, type, count, valueOffset, isLE);
      if (value) {
        const tagName = EXIF_TAGS[tag] ?? `Tag_0x${tag.toString(16)}`;
        result[tagName] = value;
      }
      entryOffset += 12;
    }

    // Check for IFD1 (Exif sub-IFD)
    ifd1Loop: for (const tagName of Object.keys(result)) {
      // no-op, just reference result to satisfy linter
      void tagName;
      break ifd1Loop;
    }

    // Try to parse Exif sub-IFD for more tags
    if (result["ExifOffset"]) {
      const subIfd = parseInt(result["ExifOffset"], 10);
      if (subIfd > 0 && subIfd < bytes.length - tiffStart) {
        const subCount = read16(subIfd);
        let subOffset = subIfd + 2;
        for (let e = 0; e < subCount && subOffset + 12 <= bytes.length - tiffStart; e++) {
          const tag = read16(subOffset);
          const type = read16(subOffset + 2);
          const count = read32(subOffset + 4);
          const value = readExifValue(bytes, tiffStart, tag, type, count, subOffset + 8, isLE);
          if (value) {
            const tagName = EXIF_TAGS[tag] ?? `Tag_0x${tag.toString(16)}`;
            result[tagName] = value;
          }
          subOffset += 12;
        }
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

function readUInt16LE(buf: Uint8Array, offset: number): number {
  return (buf[offset + 1] << 8) | buf[offset];
}

function readUInt32LE(buf: Uint8Array, offset: number): number {
  return ((buf[offset + 3] << 24) | (buf[offset + 2] << 16) | (buf[offset + 1] << 8) | buf[offset]) >>> 0;
}

const EXIF_TAGS: Record<number, string> = {
  0x010f: "Make",
  0x0110: "Model",
  0x0112: "Orientation",
  0x011a: "XResolution",
  0x011b: "YResolution",
  0x0128: "ResolutionUnit",
  0x0131: "Software",
  0x0132: "DateTime",
  0x013e: "WhitePoint",
  0x8298: "Copyright",
  0x8769: "ExifOffset",
  0x829a: "ExposureTime",
  0x829d: "FNumber",
  0x8822: "ExposureProgram",
  0x8827: "ISOSpeedRatings",
  0x9003: "DateTimeOriginal",
  0x9004: "DateTimeDigitized",
  0x9201: "ShutterSpeedValue",
  0x9202: "ApertureValue",
  0x9204: "ExposureBiasValue",
  0x9207: "MeteringMode",
  0x9208: "LightSource",
  0x9209: "Flash",
  0x920a: "FocalLength",
  0xa002: "PixelXDimension",
  0xa003: "PixelYDimension",
  0xa210: "FocalPlaneResolutionUnit",
  0xa215: "ExposureIndex",
  0xa300: "FileSource",
  0xa301: "SceneType",
  0xa401: "CustomRendered",
  0xa402: "ExposureMode",
  0xa403: "WhiteBalance",
  0xa404: "DigitalZoomRatio",
  0xa405: "FocalLengthIn35mmFilm",
  0xa431: "BodySerialNumber",
  0xa432: "LensSpecification",
  0xa433: "LensMake",
  0xa434: "LensModel",
  0xa435: "LensSerialNumber",
};

function readExifValue(
  bytes: Uint8Array,
  tiffStart: number,
  _tag: number,
  type: number,
  count: number,
  valueOffset: number,
  isLE: boolean
): string | null {
  const read16 = (off: number) => isLE ? readUInt16LE(bytes, tiffStart + off) : readUInt16BE(bytes, tiffStart + off);
  const read32 = (off: number) => isLE ? readUInt32LE(bytes, tiffStart + off) : readUInt32BE(bytes, tiffStart + off);

  const typeSizes = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];
  const typeSize = type < typeSizes.length ? typeSizes[type] : 1;
  const totalSize = typeSize * count;

  let dataOffset: number;
  if (totalSize <= 4) {
    dataOffset = valueOffset;
  } else {
    const pointer = read32(valueOffset);
    dataOffset = pointer;
  }

  try {
    switch (type) {
      case 2: // ASCII
        const strBytes = bytes.slice(tiffStart + dataOffset, tiffStart + dataOffset + count);
        let str = "";
        for (const b of strBytes) {
          if (b === 0) break;
          str += String.fromCharCode(b);
        }
        return str.trim() || null;
      case 3: // SHORT
        if (count === 1) return String(read16(dataOffset));
        return Array.from({ length: Math.min(count, 4) }, (_, i) => read16(dataOffset + i * 2)).join(", ");
      case 4: // LONG
        if (count === 1) return String(read32(dataOffset));
        return Array.from({ length: Math.min(count, 4) }, (_, i) => read32(dataOffset + i * 4)).join(", ");
      case 5: // RATIONAL (URational)
        if (count >= 1) {
          const num = read32(dataOffset);
          const den = read32(dataOffset + 4);
          return den !== 0 ? `${num}/${den}` : `${num}`;
        }
        return null;
      case 7: // UNDEFINED
        return `${count} bytes`;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function parsePNG(bytes: Uint8Array): { width: number; height: number; hasC2PA: boolean } {
  // PNG signature: 8 bytes, then IHDR chunk
  if (bytes.length < 24) return { width: 0, height: 0, hasC2PA: false };
  // Verify PNG signature
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) {
    return { width: 0, height: 0, hasC2PA: false };
  }
  // IHDR chunk starts at offset 8, length=4, type=4, data=13
  const width = readUInt32BE(bytes, 16);
  const height = readUInt32BE(bytes, 20);

  // Scan for c2pa chunks (caBX)
  let hasC2PA = false;
  let offset = 8;
  while (offset + 8 < bytes.length) {
    const chunkLen = readUInt32BE(bytes, offset);
    const chunkType = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    if (chunkType === "caBX" || chunkType === "cabx") {
      hasC2PA = true;
      break;
    }
    offset += 12 + chunkLen; // length + type + data + crc
    if (chunkType === "IEND") break;
  }

  return { width, height, hasC2PA };
}

function parseWebP(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 30) return { width: 0, height: 0 };
  // RIFF....WEBP
  if (bytes[0] !== 0x52 || bytes[8] !== 0x57 || bytes[12] !== 0x56) return { width: 0, height: 0 };
  const fourcc = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (fourcc === "VP8 ") {
    const width = readUInt16LE(bytes, 26) & 0x3fff;
    const height = readUInt16LE(bytes, 28) & 0x3fff;
    return { width, height };
  } else if (fourcc === "VP8L") {
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return { width, height };
  } else if (fourcc === "VP8X") {
    const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    return { width, height };
  }
  return { width: 0, height: 0 };
}

function parseImage(bytes: Uint8Array, mimeType: string): ImageInfo {
  if (mimeType === "image/png") {
    const { width, height, hasC2PA } = parsePNG(bytes);
    return { format: "PNG", width, height, exif: null, hasC2PA, c2paManifest: hasC2PA ? { detected: true } : null };
  } else if (mimeType === "image/webp") {
    const { width, height } = parseWebP(bytes);
    return { format: "WebP", width, height, exif: null, hasC2PA: false, c2paManifest: null };
  } else {
    // JPEG / default
    const { width, height, exif, hasC2PA } = parseJPEG(bytes);
    return { format: "JPEG", width, height, exif, hasC2PA, c2paManifest: hasC2PA ? { detected: true } : null };
  }
}

// ============================================================
// MP4/MOV container parsing (for video metadata)
// ============================================================

interface VideoInfo {
  width: number;
  height: number;
  durationSeconds: number;
  codec: string;
  hasAudio: boolean;
}

function parseMP4(bytes: Uint8Array): VideoInfo {
  let width = 0;
  let height = 0;
  let durationSeconds = 0;
  let codec = "unknown";
  let hasAudio = false;

  // Search for moov atom and parse child atoms
  let offset = 0;
  const foundTkhd: Uint8Array[] = [];
  let mvhdData: Uint8Array | null = null;

  function scanAtoms(start: number, end: number, depth: number) {
    let pos = start;
    while (pos + 8 <= end) {
      const size = readUInt32BE(bytes, pos);
      const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);

      if (size < 8 || pos + size > end) break;

      if (type === "moov" || type === "trak" || type === "mdia" || type === "minf" || type === "stbl" || type === "udta") {
        scanAtoms(pos + 8, pos + size, depth + 1);
      } else if (type === "mvhd") {
        mvhdData = bytes.slice(pos + 8, pos + size);
      } else if (type === "tkhd") {
        foundTkhd.push(bytes.slice(pos + 8, pos + size));
      } else if (type === "stsd") {
        // Parse stsd to find codec
        if (pos + 20 < end) {
          const codecType = String.fromCharCode(bytes[pos + 16], bytes[pos + 17], bytes[pos + 18], bytes[pos + 19]);
          if (codecType === "avc1" || codecType === "avc3" || codecType === "hev1" || codecType === "hvc1" || codecType === "vp08" || codecType === "vp09") {
            codec = codecType;
          }
          if (codecType === "mp4a" || codecType === "ac-3" || codecType === "ec-3" || codecType === "opus") {
            hasAudio = true;
          }
        }
      }

      pos += size;
    }
  }

  try {
    scanAtoms(0, Math.min(bytes.length, 5 * 1024 * 1024), 0);
  } catch {
    // ignore parse errors
  }

  // Parse mvhd for duration
  if (mvhdData && mvhdData.length >= 24) {
    const version = mvhdData[0];
    let timescale: number;
    let duration: number;
    if (version === 0) {
      timescale = readUInt32BE(mvhData_safe(mvhdData), 12);
      duration = readUInt32BE(mvhData_safe(mvhdData), 16);
    } else {
      timescale = readUInt32BE(mvhdData, 24);
      duration = Number(readUInt32BE_safe(mvhdData, 16)) || readUInt32BE(mvhdData, 28);
    }
    if (timescale > 0) durationSeconds = duration / timescale;
  }

  // Parse tkhd for dimensions
  for (const tkhd of foundTkhd) {
    if (tkhd.length >= 84) {
      const version = tkhd[0];
      const w = readUInt16BE(tkhd, version === 0 ? 76 : 84);
      const h = readUInt16BE(tkhd, version === 0 ? 80 : 88);
      if (w > 0 && h > 0 && w !== 0) {
        width = w >> 16;
        height = h >> 16;
        if (width > 0 && height > 0) break;
        // tkhd width/height are fixed-point 16.16
        width = w / 65536;
        height = h / 65536;
        if (width > 0 && height > 0) break;
      }
    }
  }

  // If no tkhd dimensions, try stsd v0 sample description
  if (width === 0 || height === 0) {
    // Fallback: search for avcC/visual sample entry
    for (let i = 0; i < Math.min(bytes.length - 32, 2 * 1024 * 1024); i++) {
      const type = String.fromCharCode(bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]);
      if (type === "avc1" || type === "hvc1" || type === "hev1" || type === "vp08" || type === "vp09") {
        if (i + 32 < bytes.length) {
          width = readUInt16BE(bytes, i + 24);
          height = readUInt16BE(bytes, i + 26);
          if (width > 0 && height > 0) break;
        }
      }
    }
  }

  return { width, height, durationSeconds, codec, hasAudio };
}

function mvhData_safe(data: Uint8Array): Uint8Array {
  return data;
}

function readUInt32BE_safe(buf: Uint8Array, offset: number): number {
  if (offset + 4 > buf.length) return 0;
  return readUInt32BE(buf, offset);
}

// ============================================================
// AI detection heuristics
// ============================================================

interface AIDetectionSignals {
  signals: { label: string; detail: string; stance: MediaStance; confidence: number; weight: number }[];
}

function analyzeAIDetectionSignals(
  img: ImageInfo,
  fileSize: number,
  mimeType: string,
  exifFindings: Record<string, string> | null,
  hasC2PA: boolean
): AIDetectionSignals {
  const signals: AIDetectionSignals["signals"] = [];
  const width = img.width;
  const height = img.height;
  const pixels = width * height;
  const bytesPerPixel = pixels > 0 ? fileSize / pixels : 0;

  // Signal 1: EXIF presence
  if (!exifFindings || Object.keys(exifFindings).length === 0) {
    signals.push({
      label: "No EXIF metadata",
      detail: "The image contains no EXIF data. Authentic photographs from cameras and phones typically embed EXIF with camera model, timestamp, and exposure settings. AI-generated images rarely include EXIF unless deliberately injected.",
      stance: "supports_ai",
      confidence: 0.55,
      weight: 2,
    });
  } else {
    // Check for camera-specific EXIF
    const hasCamera = !!(exifFindings["Make"] || exifFindings["Model"]);
    const hasExposure = !!(exifFindings["ExposureTime"] || exifFindings["FNumber"] || exifFindings["ISOSpeedRatings"]);
    const hasLens = !!(exifFindings["LensModel"] || exifFindings["LensMake"]);
    const hasDateTime = !!exifFindings["DateTimeOriginal"];

    if (hasCamera && hasExposure) {
      signals.push({
        label: "Camera EXIF metadata present",
        detail: `EXIF contains camera information (Make: ${exifFindings["Make"] ?? "n/a"}, Model: ${exifFindings["Model"] ?? "n/a"}) and exposure parameters, consistent with a genuine camera capture.`,
        stance: "supports_authentic",
        confidence: 0.65,
        weight: 3,
      });
    }
    if (hasLens) {
      signals.push({
        label: "Lens metadata present",
        detail: `EXIF records lens information (${exifFindings["LensModel"] ?? exifFindings["LensMake"] ?? "detected"}), which is typical of authentic camera photographs and uncommon in AI-generated images.`,
        stance: "supports_authentic",
        confidence: 0.6,
        weight: 2,
      });
    }
    if (!hasCamera && !hasExposure && hasDateTime) {
      signals.push({
        label: "Partial EXIF (timestamp only)",
        detail: "EXIF contains a timestamp but no camera or exposure metadata. This pattern can occur with edited/screenshot images or when metadata has been stripped and partially re-added.",
        stance: "neutral",
        confidence: 0.4,
        weight: 1,
      });
    }
  }

  // Signal 2: C2PA / Content Credentials
  if (hasC2PA) {
    signals.push({
      label: "C2PA content credentials detected",
      detail: "A C2PA (Content Authenticity Initiative) manifest was found embedded in the image. This cryptographically signed provenance manifest indicates the image's editing history is attested by its creator, strongly supporting authenticity.",
      stance: "supports_authentic",
      confidence: 0.8,
      weight: 4,
    });
  } else {
    signals.push({
      label: "No C2PA content credentials",
      detail: "No C2PA (Content Provenance and Authenticity) manifest was detected. While many authentic images also lack C2PA, its absence means there is no cryptographic provenance chain to verify the image's origin.",
      stance: "neutral",
      confidence: 0.3,
      weight: 1,
    });
  }

  // Signal 3: Dimension analysis
  if (width > 0 && height > 0) {
    const aspect = width / height;
    // Common AI generation sizes: 1024x1024, 1024x1792, 1792x1024, 512x512, etc.
    const isCommonAISize =
      (width === 1024 && height === 1024) ||
      (width === 512 && height === 512) ||
      (width === 1024 && height === 1792) ||
      (width === 1792 && height === 1024) ||
      (width === 768 && height === 768) ||
      (width === 1536 && height === 1536);

    if (isCommonAISize) {
      signals.push({
        label: "Dimensions match common AI generation sizes",
        detail: `Image dimensions are ${width}x${height}px, which matches a standard AI image generation output size. While these dimensions are also used in other contexts, they are a known signal for AI-generated content.`,
        stance: "supports_ai",
        confidence: 0.45,
        weight: 2,
      });
    } else {
      // Check for typical camera dimensions
      const isCameraTypical =
        (width >= 3000 && width <= 9000) || (height >= 3000 && height <= 9000);
      if (isCameraTypical) {
        signals.push({
          label: "High-resolution dimensions typical of camera capture",
          detail: `Image dimensions are ${width}x${height}px, which is within the range typical of modern camera sensors. AI-generated images are often at lower resolutions unless upscaled.`,
          stance: "supports_authentic",
          confidence: 0.4,
          weight: 1,
        });
      }
    }

    // Very unusual aspect ratios
    if (aspect > 2.5 || aspect < 0.4) {
      signals.push({
        label: "Unusual aspect ratio",
        detail: `The aspect ratio of ${aspect.toFixed(2)}:1 is uncommon for standard photography, which may indicate cropping, compositing, or AI generation.`,
        stance: "supports_manipulation",
        confidence: 0.35,
        weight: 1,
      });
    }
  }

  // Signal 4: Compression analysis
  if (pixels > 0) {
    if (mimeType === "image/jpeg") {
      if (bytesPerPixel > 2.5) {
        signals.push({
          label: "Very high quality (low compression)",
          detail: `The file has ${bytesPerPixel.toFixed(2)} bytes per pixel, indicating very low JPEG compression (high quality). This is typical of original camera JPEGs or high-quality exports, and less common in web-shared images which are usually re-compressed.`,
          stance: "supports_authentic",
          confidence: 0.4,
          weight: 1,
        });
      } else if (bytesPerPixel < 0.15) {
        signals.push({
          label: "Heavy compression detected",
          detail: `The file has only ${bytesPerPixel.toFixed(2)} bytes per pixel, indicating heavy JPEG compression. This can result from multiple re-saves or web sharing, which degrades forensic indicators but does not itself indicate AI generation.`,
          stance: "neutral",
          confidence: 0.3,
          weight: 1,
        });
      }
    } else if (mimeType === "image/png" && bytesPerPixel > 3) {
      signals.push({
        label: "Uncompressed PNG (lossless)",
        detail: `The PNG file has ${bytesPerPixel.toFixed(2)} bytes per pixel, suggesting near-lossless or original-quality storage. AI-generated images exported as PNG often retain this quality, but so do original screenshots and digital art.`,
        stance: "neutral",
        confidence: 0.25,
        weight: 1,
      });
    }
  }

  // Signal 5: Software tag analysis
  if (exifFindings?.["Software"]) {
    const sw = exifFindings["Software"].toLowerCase();
    const aiTools = ["midjourney", "dall-e", "dalle", "stable diffusion", "sdxl", "comfyui", "automatic1111", "firefly", "imagen", "leonardo", "novelai"];
    const editingTools = ["photoshop", "gimp", "lightroom", "affinity", "snapseed", "pixlr", "canva"];
    if (aiTools.some((t) => sw.includes(t))) {
      signals.push({
        label: "AI generation tool in software metadata",
        detail: `The EXIF Software tag contains "${exifFindings["Software"]}", which is associated with AI image generation tools.`,
        stance: "supports_ai",
        confidence: 0.85,
        weight: 5,
      });
    } else if (editingTools.some((t) => sw.includes(t))) {
      signals.push({
        label: "Image editing software in metadata",
        detail: `The EXIF Software tag contains "${exifFindings["Software"]}", indicating the image was processed with an editing application. This does not prove manipulation but confirms post-processing occurred.`,
        stance: "supports_manipulation",
        confidence: 0.4,
        weight: 1,
      });
    }
  }

  return { signals };
}

// ============================================================
// Source investigation
// ============================================================

function publisherOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

async function sourceSearch(url: string | null, fileName: string | null): Promise<EvidenceInput[]> {
  const evidence: EvidenceInput[] = [];
  if (!url) return evidence;

  // For URL inputs, search for the URL itself to find where it appears
  try {
    const query = encodeURIComponent(url);
    const ddgUrl = `https://api.duckduckgo.com/?q=${query}&format=json&no_html=1&skip_disambig=1`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(ddgUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "TruthLayer/1.0 (media-verification)" },
    });
    clearTimeout(timer);
    if (res.ok) {
      const json = await res.json();
      if (json.AbstractText && json.AbstractURL) {
        evidence.push({
          source_title: json.Heading || "Reference",
          source_url: json.AbstractURL,
          publisher: publisherOf(json.AbstractURL),
          publication_date: null,
          excerpt: String(json.AbstractText).slice(0, 500),
          relevance: "medium",
          relationship: "context",
        });
      }
      for (const topic of (json.RelatedTopics ?? []).slice(0, 4)) {
        if (topic.Text && topic.FirstURL) {
          evidence.push({
            source_title: String(topic.Text).slice(0, 120),
            source_url: topic.FirstURL,
            publisher: publisherOf(topic.FirstURL),
            publication_date: null,
            excerpt: String(topic.Text).slice(0, 400),
            relevance: "low",
            relationship: "similar_content",
          });
        }
      }
    }
  } catch {
    // continue
  }

  // Also search by domain name for context
  try {
    const parsed = new URL(url);
    const domain = parsed.hostname.replace(/^www\./, "");
    const domainQuery = encodeURIComponent(domain);
    const ddgUrl = `https://api.duckduckgo.com/?q=${domainQuery}&format=json&no_html=1&skip_disambig=1`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(ddgUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "TruthLayer/1.0 (media-verification)" },
    });
    clearTimeout(timer);
    if (res.ok) {
      const json = await res.json();
      if (json.AbstractText && json.AbstractURL && !evidence.some((e) => e.source_url === json.AbstractURL)) {
        evidence.push({
          source_title: json.Heading || `About ${domain}`,
          source_url: json.AbstractURL,
          publisher: publisherOf(json.AbstractURL),
          publication_date: null,
          excerpt: String(json.AbstractText).slice(0, 500),
          relevance: "medium",
          relationship: "context",
        });
      }
    }
  } catch {
    // continue
  }

  void fileName;
  return evidence.slice(0, 6);
}

// ============================================================
// Classification logic
// ============================================================

function computeClassification(
  findings: FindingInput[],
  mediaType: MediaType,
  sourceUrl: string | null
): { classification: MediaClassification; confidence: number; summary: string } {
  const stanceWeights: Record<MediaStance, number> = {
    supports_authentic: 0,
    supports_ai: 0,
    supports_manipulation: 0,
    supports_misleading: 0,
    neutral: 0,
  };

  const methodConfidence: Record<MediaStance, number> = {
    supports_authentic: 0,
    supports_ai: 0,
    supports_manipulation: 0,
    supports_misleading: 0,
    neutral: 0,
  };

  const stanceCounts: Record<MediaStance, number> = {
    supports_authentic: 0,
    supports_ai: 0,
    supports_manipulation: 0,
    supports_misleading: 0,
    neutral: 0,
  };

  for (const f of findings) {
    if (f.result_type === "signal" || f.result_type === "observation") {
      const weight = f.confidence * (f.result_type === "signal" ? 1.5 : 1.0);
      stanceWeights[f.stance] += weight * f.confidence;
      methodConfidence[f.stance] = Math.max(methodConfidence[f.stance], f.confidence);
      stanceCounts[f.stance] += 1;
    }
  }

  const scores = [
    { stance: "supports_authentic" as const, score: stanceWeights.supports_authentic },
    { stance: "supports_ai" as const, score: stanceWeights.supports_ai },
    { stance: "supports_manipulation" as const, score: stanceWeights.supports_manipulation },
    { stance: "supports_misleading" as const, score: stanceWeights.supports_misleading },
  ].sort((a, b) => b.score - a.score);

  const top = scores[0];
  const second = scores[1];

  // If no meaningful signals, inconclusive
  if (top.score < 0.15) {
    return {
      classification: "inconclusive",
      confidence: 0.3,
      summary: buildSummary("inconclusive", findings, mediaType, sourceUrl),
    };
  }

  // If top score is clearly dominant
  const margin = top.score - (second?.score ?? 0);
  const dominance = margin / (top.score + 0.01);

  let classification: MediaClassification;
  let confidence: number;

  if (top.stance === "supports_authentic") {
    classification = "likely_authentic";
    confidence = Math.min(0.9, 0.4 + top.score * 0.3);
  } else if (top.stance === "supports_ai") {
    classification = "likely_ai_generated";
    confidence = Math.min(0.9, 0.4 + top.score * 0.3);
  } else if (top.stance === "supports_manipulation") {
    classification = "likely_manipulated";
    confidence = Math.min(0.85, 0.35 + top.score * 0.3);
  } else if (top.stance === "supports_misleading") {
    classification = "misleading_context";
    confidence = Math.min(0.8, 0.35 + top.score * 0.3);
  } else {
    classification = "inconclusive";
    confidence = 0.3;
  }

  // If signals are mixed and close, lower confidence
  if (dominance < 0.3) {
    confidence *= 0.7;
    if (confidence < 0.4) {
      classification = "inconclusive";
      confidence = 0.35;
    }
  }

  return {
    classification,
    confidence: Math.round(confidence * 1000) / 1000,
    summary: buildSummary(classification, findings, mediaType, sourceUrl),
  };
}

function buildSummary(
  classification: MediaClassification,
  findings: FindingInput[],
  mediaType: MediaType,
  sourceUrl: string | null
): string {
  const mediaLabel = mediaType === "image" ? "image" : "video";
  const sourceLabel = sourceUrl ? ` from ${publisherOf(sourceUrl)}` : "";

  const verdictText: Record<MediaClassification, string> = {
    likely_authentic: "appears likely authentic",
    likely_ai_generated: "shows strong indicators of being AI-generated",
    likely_manipulated: "shows signs of manipulation or editing",
    misleading_context: "may be presented in a misleading context",
    inconclusive: "could not be definitively classified",
  };

  const keyFindings = findings
    .filter((f) => f.result_type === "signal" && f.stance !== "neutral")
    .slice(0, 5)
    .map((f) => f.label);

  const findingText = keyFindings.length > 0
    ? ` Key findings: ${keyFindings.join("; ")}.`
    : "";

  const limitationText = findings.some((f) => f.result_type === "limitation")
    ? " Some analysis methods were limited by the available data or environment constraints."
    : "";

  return `This ${mediaLabel}${sourceLabel} ${verdictText[classification]}.${findingText}${limitationText} The assessment is based on ${findings.length} forensic analysis signal(s) across metadata, compression, provenance, and source investigation methods.`;
}

// ============================================================
// Gemini integration (optional - for summary interpretation only)
// ============================================================

async function interpretWithGemini(findings: FindingInput[], classification: MediaClassification, mediaType: MediaType): Promise<string | null> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return null;

  try {
    const findingsText = findings.map((f) => `- [${f.method}] ${f.label}: ${f.detail} (stance: ${f.stance}, confidence: ${f.confidence})`).join("\n");

    const prompt = `You are a forensic media analyst. Based on the following collected forensic findings, write a concise 2-3 paragraph summary interpreting what these signals indicate about the authenticity of this ${mediaType}. Do not invent new findings — only interpret the existing ones. The preliminary classification is: ${classification}.

Findings:
${findingsText}`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 500 },
      }),
    });

    if (!res.ok) return null;
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    return typeof text === "string" && text.trim().length > 50 ? text.trim() : null;
  } catch {
    return null;
  }
}

// ============================================================
// Main handler
// ============================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json().catch(() => ({}));
    const investigationId = body.investigationId as string | undefined;
    if (!investigationId) {
      return new Response(JSON.stringify({ error: "investigationId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: investigation, error: invError } = await supabase
      .from("media_investigations")
      .select("*")
      .eq("id", investigationId)
      .maybeSingle();

    if (invError || !investigation) {
      return new Response(JSON.stringify({ error: "Investigation not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update status to processing
    await supabase
      .from("media_investigations")
      .update({ status: "processing" })
      .eq("id", investigationId);

    const mediaType = (body.mediaType ?? investigation.media_type) as MediaType;
    const mediaUrl = (body.mediaUrl ?? investigation.media_url) as string | undefined;
    const mimeType = (body.mimeType ?? investigation.mime_type) as string | undefined;
    const sourceUrl = (body.sourceUrl ?? investigation.source_url) as string | null;
    const inputMethod = (body.inputMethod ?? investigation.input_method) as string;

    if (!mediaUrl) {
      await failInvestigation(supabase, investigationId, "No media URL available for analysis");
      return jsonResp({ ok: false, error: "no media url" });
    }

    // Fetch the media file
    let mediaBytes: Uint8Array;
    let contentType: string;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      const res = await fetch(mediaUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        await failInvestigation(supabase, investigationId, `Failed to fetch media: HTTP ${res.status}`);
        return jsonResp({ ok: false, error: "fetch failed" });
      }
      contentType = res.headers.get("content-type") ?? mimeType ?? "application/octet-stream";
      const buf = await res.arrayBuffer();
      mediaBytes = new Uint8Array(buf);
    } catch (err) {
      await failInvestigation(supabase, investigationId, `Failed to fetch media: ${err instanceof Error ? err.message : "unknown"}`);
      return jsonResp({ ok: false, error: "fetch failed" });
    }

    const fileSize = mediaBytes.length;
    const findings: FindingInput[] = [];
    const frames: FrameInput[] = [];
    let width = 0;
    let height = 0;
    let durationSeconds: number | null = null;

    // ============================================================
    // Run forensic pipeline
    // ============================================================

    if (mediaType === "image") {
      // --- Parse image ---
      const img = parseImage(mediaBytes, contentType);

      width = img.width;
      height = img.height;

      // --- Metadata finding ---
      findings.push({
        method: "metadata",
        result_type: "observation",
        label: `File metadata: ${img.format}, ${formatBytes(fileSize)}`,
        detail: `File is ${img.format} format, ${fileSize.toLocaleString()} bytes (${formatBytes(fileSize)}). MIME type: ${contentType}. ${img.width > 0 ? `Dimensions: ${img.width}x${img.height}px.` : "Dimensions could not be parsed."}`,
        stance: "neutral",
        confidence: 0.9,
        raw_data: { format: img.format, fileSize, contentType, width: img.width, height: img.height },
      });

      // --- Dimensions finding ---
      if (img.width > 0 && img.height > 0) {
        const aspect = (img.width / img.height).toFixed(2);
        const megapixels = ((img.width * img.height) / 1_000_000).toFixed(1);
        findings.push({
          method: "dimensions",
          result_type: "observation",
          label: `${img.width}x${img.height}px (${megapixels}MP, ${aspect}:1)`,
          detail: `Image dimensions are ${img.width}x${img.height} pixels (${megapixels} megapixels, aspect ratio ${aspect}:1). ${getDimensionContext(img.width, img.height)}`,
          stance: getDimensionStance(img.width, img.height),
          confidence: 0.5,
          raw_data: { width: img.width, height: img.height, aspectRatio: parseFloat(aspect), megapixels: parseFloat(megapixels) },
        });
      } else {
        findings.push({
          method: "dimensions",
          result_type: "limitation",
          label: "Dimensions could not be parsed",
          detail: "The image dimensions could not be extracted from the file headers. The file may be corrupted or use an unsupported sub-format.",
          stance: "neutral",
          confidence: 0.2,
        });
      }

      // --- EXIF finding ---
      if (img.exif && Object.keys(img.exif).length > 0) {
        const exifList = Object.entries(img.exif).map(([k, v]) => `${k}: ${v}`).join("; ");
        const hasCamera = !!(img.exif["Make"] || img.exif["Model"]);
        findings.push({
          method: "exif",
          result_type: "signal",
          label: hasCamera ? "EXIF metadata with camera info" : "EXIF metadata present",
          detail: `EXIF data found: ${exifList}. ${hasCamera ? "Camera make/model present, consistent with authentic photograph capture." : "EXIF present but no camera information detected."}`,
          stance: hasCamera ? "supports_authentic" : "neutral",
          confidence: hasCamera ? 0.65 : 0.4,
          raw_data: img.exif as Record<string, unknown>,
        });
      } else {
        findings.push({
          method: "exif",
          result_type: "signal",
          label: "No EXIF metadata",
          detail: "No EXIF metadata was found in the image. Authentic photographs from cameras and phones typically contain EXIF data. Its absence may indicate metadata stripping, web re-sharing, or AI generation.",
          stance: "supports_ai",
          confidence: 0.55,
          raw_data: { exifPresent: false },
        });
      }

      // --- C2PA finding ---
      if (img.hasC2PA) {
        findings.push({
          method: "c2pa",
          result_type: "signal",
          label: "C2PA content credentials detected",
          detail: "A C2PA (Content Provenance and Authenticity) manifest was detected embedded in the image. This cryptographically signed manifest attests to the image's origin and editing history, providing strong evidence of authenticity.",
          stance: "supports_authentic",
          confidence: 0.8,
          raw_data: { c2paDetected: true },
        });
      } else {
        findings.push({
          method: "c2pa",
          result_type: "observation",
          label: "No C2PA content credentials",
          detail: "No C2PA content credentials manifest was detected. While many authentic images also lack C2PA (it is not yet universally adopted), its absence means there is no cryptographic provenance chain to verify the image's origin.",
          stance: "neutral",
          confidence: 0.3,
          raw_data: { c2paDetected: false },
        });
      }

      // --- Compression finding ---
      if (img.width > 0 && img.height > 0) {
        const bytesPerPixel = fileSize / (img.width * img.height);
        findings.push({
          method: "compression",
          result_type: "observation",
          label: `${bytesPerPixel.toFixed(2)} bytes/pixel`,
          detail: getCompressionDetail(bytesPerPixel, contentType, img.width, img.height, fileSize),
          stance: getCompressionStance(bytesPerPixel, contentType),
          confidence: 0.4,
          raw_data: { bytesPerPixel: parseFloat(bytesPerPixel.toFixed(3)), fileSize, mimeType: contentType },
        });
      }

      // --- AI detection signals ---
      const aiSignals = analyzeAIDetectionSignals(img, fileSize, contentType, img.exif, img.hasC2PA);
      // Deduplicate: skip AI detection signals that duplicate EXIF/C2PA findings
      const exifFindingExists = findings.some((f) => f.method === "exif");
      const c2paFindingExists = findings.some((f) => f.method === "c2pa");

      for (const signal of aiSignals.signals) {
        // Skip if label duplicates an existing finding
        if (exifFindingExists && signal.label.includes("EXIF")) continue;
        if (c2paFindingExists && signal.label.includes("C2PA")) continue;

        findings.push({
          method: "ai_detection",
          result_type: "signal",
          label: signal.label,
          detail: signal.detail,
          stance: signal.stance,
          confidence: signal.confidence,
          raw_data: { weight: signal.weight, heuristic: true },
        });
      }

      // Create a representative "frame" for the image (so the UI can show it)
      const frameId = await createAndStoreFrame(
        supabase,
        investigationId,
        0,
        null,
        mediaUrl,
        img.width,
        img.height,
        true
      );
      if (frameId) {
        frames.push({
          frame_order: 0,
          timestamp_seconds: null,
          storage_path: `image/${investigationId}`,
          public_url: mediaUrl,
          width: img.width || null,
          height: img.height || null,
          is_representative: true,
        });
      }

    } else {
      // ============================================================
      // VIDEO analysis
      // ============================================================

      const videoInfo = parseMP4(mediaBytes);
      width = videoInfo.width;
      height = videoInfo.height;
      durationSeconds = videoInfo.durationSeconds > 0 ? videoInfo.durationSeconds : null;

      // --- Metadata finding ---
      findings.push({
        method: "metadata",
        result_type: "observation",
        label: `Video: ${videoInfo.codec}, ${formatBytes(fileSize)}`,
        detail: `Video file is ${fileSize.toLocaleString()} bytes (${formatBytes(fileSize)}). Codec: ${videoInfo.codec}. ${videoInfo.hasAudio ? "Audio track detected." : "No audio track detected or audio codec not recognized."} ${width > 0 ? `Dimensions: ${width}x${height}px.` : "Dimensions could not be parsed from container."} ${durationSeconds ? `Duration: ${durationSeconds.toFixed(1)}s.` : "Duration could not be determined."}`,
        stance: "neutral",
        confidence: 0.85,
        raw_data: { codec: videoInfo.codec, hasAudio: videoInfo.hasAudio, width, height, durationSeconds, fileSize, mimeType: contentType },
      });

      // --- Dimensions finding ---
      if (width > 0 && height > 0) {
        findings.push({
          method: "dimensions",
          result_type: "observation",
          label: `${width}x${height}px video`,
          detail: `Video resolution is ${width}x${height} pixels. ${getVideoDimensionContext(width, height)}`,
          stance: "neutral",
          confidence: 0.5,
          raw_data: { width, height },
        });
      } else {
        findings.push({
          method: "dimensions",
          result_type: "limitation",
          label: "Video dimensions not parsed",
          detail: "Video dimensions could not be extracted from the container metadata. The file may use a non-standard container or the moov atom is not in the initial bytes.",
          stance: "neutral",
          confidence: 0.2,
        });
      }

      // --- Duration finding ---
      if (durationSeconds !== null) {
        findings.push({
          method: "metadata",
          result_type: "observation",
          label: `Duration: ${durationSeconds.toFixed(1)}s`,
          detail: `Video duration is ${durationSeconds.toFixed(1)} seconds (${formatDuration(durationSeconds)}). ${durationSeconds < 3 ? "Very short clips are common in AI-generated or manipulated video content." : durationSeconds > 300 ? "Long-form video content." : "Standard clip duration."}`,
          stance: durationSeconds < 3 ? "supports_ai" : "neutral",
          confidence: durationSeconds < 3 ? 0.3 : 0.6,
          raw_data: { durationSeconds },
        });
      }

      // --- Compression finding ---
      if (width > 0 && height > 0 && durationSeconds !== null && durationSeconds > 0) {
        const bitrate = (fileSize * 8) / durationSeconds;
        const bitrateStr = formatBitrate(bitrate);
        findings.push({
          method: "compression",
          result_type: "observation",
          label: `Bitrate: ${bitrateStr}`,
          detail: `Estimated video bitrate is ${bitrateStr} (${(fileSize / durationSeconds / 1024).toFixed(0)} KB/s). ${getBitrateContext(bitrate, width, height)}`,
          stance: "neutral",
          confidence: 0.4,
          raw_data: { bitrate: Math.round(bitrate), fileSize, durationSeconds },
        });
      }

      // --- EXIF (unavailable for video) ---
      findings.push({
        method: "exif",
        result_type: "unavailable",
        label: "EXIF not applicable to video container",
        detail: "EXIF metadata is an image format standard and is not embedded in standard video containers. Video provenance relies on container metadata and C2PA manifests instead.",
        stance: "neutral",
        confidence: 0.2,
      });

      // --- C2PA finding ---
      findings.push({
        method: "c2pa",
        result_type: "observation",
        label: "No C2PA manifest detected in video",
        detail: "No C2PA content credentials manifest was detected in the video container. C2PA for video is not yet widely adopted, so its absence is not a strong signal either way.",
        stance: "neutral",
        confidence: 0.25,
      });

      // --- Frame extraction (limitation) ---
      findings.push({
        method: "visual_inconsistency",
        result_type: "limitation",
        label: "Frame-by-frame visual analysis unavailable",
        detail: "Server-side frame extraction requires video decoding tools that are not available in this analysis environment. Visual inconsistency detection across frames could not be performed. For thorough video forensics, download and analyze individual frames with dedicated tools.",
        stance: "neutral",
        confidence: 0.15,
      });

      // --- Temporal consistency (limitation) ---
      findings.push({
        method: "temporal_consistency",
        result_type: "limitation",
        label: "Temporal consistency analysis unavailable",
        detail: "Temporal consistency analysis (detecting flickering, morphing, or inconsistent motion typical of AI-generated video) requires frame extraction, which is not available in this environment.",
        stance: "neutral",
        confidence: 0.15,
      });

      // --- AV sync (limitation, unless no audio) ---
      if (!videoInfo.hasAudio) {
        findings.push({
          method: "av_sync",
          result_type: "signal",
          label: "No audio track detected",
          detail: "The video container has no audio track. While silent video is common (surveillance, screen recordings, AI-generated clips), the absence of audio means lip-sync analysis cannot be performed.",
          stance: "neutral",
          confidence: 0.3,
        });
      } else {
        findings.push({
          method: "av_sync",
          result_type: "limitation",
          label: "Audio-visual sync analysis unavailable",
          detail: "Audio-visual synchronization analysis requires decoding both audio and video streams, which is not available in this environment. AV desync is a known signal for manipulated video.",
          stance: "neutral",
          confidence: 0.15,
        });
      }

      // --- AI detection for video ---
      if (durationSeconds !== null && durationSeconds < 3 && width > 0) {
        findings.push({
          method: "ai_detection",
          result_type: "signal",
          label: "Short duration consistent with AI video generation",
          detail: `The video is ${durationSeconds.toFixed(1)}s long. AI-generated video clips are typically very short (2-10 seconds). While short clips have many legitimate uses, this is a known signal for AI-generated content.`,
          stance: "supports_ai",
          confidence: 0.35,
          raw_data: { durationSeconds, heuristic: true },
        });
      }
      if (videoInfo.codec === "vp09" || videoInfo.codec === "vp08") {
        findings.push({
          method: "ai_detection",
          result_type: "observation",
          label: "VP8/VP9 codec detected",
          detail: `The video uses ${videoInfo.codec} codec, which is common in web video but also used by some AI video generation pipelines. This alone is not a strong signal.`,
          stance: "neutral",
          confidence: 0.2,
        });
      }

      // Create a representative frame entry pointing to the video URL itself
      const frameId = await createVideoThumbnailFrame(
        supabase,
        investigationId,
        mediaUrl,
        width,
        height
      );
      if (frameId) {
        frames.push({
          frame_order: 0,
          timestamp_seconds: 0,
          storage_path: `video/${investigationId}`,
          public_url: mediaUrl,
          width: width || null,
          height: height || null,
          is_representative: true,
        });
      }
    }

    // ============================================================
    // Provenance finding
    // ============================================================
    if (inputMethod === "url" && sourceUrl) {
      findings.push({
        method: "provenance",
        result_type: "observation",
        label: `Source URL: ${publisherOf(sourceUrl)}`,
        detail: `Media was submitted via URL from ${publisherOf(sourceUrl)}. The source domain and URL path provide context for assessing provenance. ${getProvenanceContext(sourceUrl)}`,
        stance: "neutral",
        confidence: 0.5,
        raw_data: { sourceUrl, domain: publisherOf(sourceUrl) },
      });
    } else {
      findings.push({
        method: "provenance",
        result_type: "observation",
        label: "Direct file upload",
        detail: "Media was uploaded directly as a file. No source URL is available for provenance investigation. The file's embedded metadata (EXIF, C2PA) is the primary provenance signal.",
        stance: "neutral",
        confidence: 0.3,
      });
    }

    // ============================================================
    // Source investigation
    // ============================================================
    const evidenceInputs = await sourceSearch(inputMethod === "url" ? sourceUrl : null, investigation.file_name);

    if (evidenceInputs.length > 0) {
      findings.push({
        method: "source_search",
        result_type: "observation",
        label: `${evidenceInputs.length} related source(s) found`,
        detail: `Source investigation found ${evidenceInputs.length} potentially related reference(s) by searching for the media's origin domain and URL. These provide context about the publisher and any related reporting.`,
        stance: "neutral",
        confidence: 0.4,
        raw_data: { evidenceCount: evidenceInputs.length },
      });
    } else if (inputMethod === "url") {
      findings.push({
        method: "source_search",
        result_type: "limitation",
        label: "No related sources found",
        detail: "Source investigation did not find related references for this URL. This may indicate the content is original, niche, or recently published.",
        stance: "neutral",
        confidence: 0.25,
      });
    } else {
      findings.push({
        method: "source_search",
        result_type: "limitation",
        label: "Source search not applicable",
        detail: "Source search is most effective for URL-submitted media. For uploaded files, reverse image search would be needed, which is not available in this environment.",
        stance: "neutral",
        confidence: 0.15,
      });
    }

    // ============================================================
    // Write findings to database
    // ============================================================
    for (const finding of findings) {
      await supabase.from("media_findings").insert({
        investigation_id: investigationId,
        frame_id: finding.frame_id ?? null,
        method: finding.method,
        result_type: finding.result_type,
        label: finding.label,
        detail: finding.detail,
        stance: finding.stance,
        confidence: finding.confidence,
        raw_data: finding.raw_data ?? null,
      });
    }

    // Write evidence to database
    for (const ev of evidenceInputs) {
      await supabase.from("media_evidence").insert({
        investigation_id: investigationId,
        source_title: ev.source_title,
        source_url: ev.source_url,
        publisher: ev.publisher,
        publication_date: ev.publication_date,
        excerpt: ev.excerpt,
        relevance: ev.relevance,
        relationship: ev.relationship,
      });
    }

    // ============================================================
    // Compute final classification
    // ============================================================
    const { classification, confidence, summary } = computeClassification(findings, mediaType, sourceUrl);

    // Try to enhance summary with Gemini (interpretation only, not new findings)
    const geminiSummary = await interpretWithGemini(findings, classification, mediaType);
    const finalSummary = geminiSummary ?? summary;

    // ============================================================
    // Update investigation with results
    // ============================================================
    await supabase
      .from("media_investigations")
      .update({
        status: "completed",
        width: width > 0 ? width : null,
        height: height > 0 ? height : null,
        duration_seconds: durationSeconds,
        final_classification: classification,
        overall_confidence: confidence,
        overall_summary: finalSummary,
        completed_at: new Date().toISOString(),
      })
      .eq("id", investigationId);

    return jsonResp({ ok: true, investigationId, findings: findings.length, classification, confidence });
  } catch (err) {
    // Try to mark investigation as failed
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );
      const body = await req.clone().json().catch(() => ({}));
      if (body.investigationId) {
        await supabase
          .from("media_investigations")
          .update({
            status: "failed",
            error_message: err instanceof Error ? err.message : "Internal error",
            completed_at: new Date().toISOString(),
          })
          .eq("id", body.investigationId);
      }
    } catch {
      // ignore
    }
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ============================================================
// Helpers
// ============================================================

function jsonResp(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function failInvestigation(supabase: ReturnType<typeof createClient>, id: string, message: string): Promise<void> {
  await supabase
    .from("media_investigations")
    .update({
      status: "failed",
      error_message: message,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);
}

async function createAndStoreFrame(
  supabase: ReturnType<typeof createClient>,
  investigationId: string,
  order: number,
  timestamp: number | null,
  mediaUrl: string,
  width: number,
  height: number,
  isRepresentative: boolean
): Promise<string | null> {
  const { data, error } = await supabase
    .from("media_frames")
    .insert({
      investigation_id: investigationId,
      frame_order: order,
      timestamp_seconds: timestamp,
      storage_path: `frame/${investigationId}/${order}`,
      public_url: mediaUrl,
      width: width > 0 ? width : null,
      height: height > 0 ? height : null,
      is_representative: isRepresentative,
    })
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id;
}

async function createVideoThumbnailFrame(
  supabase: ReturnType<typeof createClient>,
  investigationId: string,
  mediaUrl: string,
  width: number,
  height: number
): Promise<string | null> {
  return createAndStoreFrame(supabase, investigationId, 0, 0, mediaUrl, width, height, true);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatBitrate(bps: number): string {
  if (bps < 1000) return `${Math.round(bps)} bps`;
  if (bps < 1_000_000) return `${(bps / 1000).toFixed(0)} kbps`;
  return `${(bps / 1_000_000).toFixed(2)} Mbps`;
}

function getDimensionContext(w: number, h: number): string {
  const aspect = w / h;
  if (w === 1024 && h === 1024) return "These dimensions match a common AI image generation output size.";
  if (w === 512 && h === 512) return "These dimensions match a common AI image generation output size.";
  if ((w === 1024 && h === 1792) || (w === 1792 && h === 1024)) return "These dimensions match common AI image generation output sizes.";
  if (w >= 3000 && h >= 3000) return "These are high-resolution dimensions typical of camera captures.";
  if (aspect > 2.5 || aspect < 0.4) return "This is an unusual aspect ratio that may indicate cropping or compositing.";
  return "These are standard dimensions for web-shared or edited images.";
}

function getDimensionStance(w: number, h: number): MediaStance {
  if ((w === 1024 && h === 1024) || (w === 512 && h === 512) || (w === 1024 && h === 1792) || (w === 1792 && h === 1024) || (w === 768 && h === 768)) {
    return "supports_ai";
  }
  if (w >= 3000 && h >= 3000) return "supports_authentic";
  if (w / h > 2.5 || w / h < 0.4) return "supports_manipulation";
  return "neutral";
}

function getCompressionDetail(bpp: number, mime: string, w: number, h: number, size: number): string {
  const mp = ((w * h) / 1_000_000).toFixed(1);
  if (mime.includes("jpeg")) {
    if (bpp > 2.5) return `High quality JPEG: ${bpp.toFixed(2)} bytes/pixel (${mp}MP, ${formatBytes(size)}). Low compression suggests an original or high-quality export.`;
    if (bpp < 0.15) return `Heavily compressed JPEG: ${bpp.toFixed(2)} bytes/pixel (${mp}MP, ${formatBytes(size)}). Multiple re-saves or aggressive web compression.`;
    return `Standard JPEG compression: ${bpp.toFixed(2)} bytes/pixel (${mp}MP, ${formatBytes(size)}). Typical of web-shared images.`;
  }
  if (mime.includes("png")) {
    return `PNG format: ${bpp.toFixed(2)} bytes/pixel (${mp}MP, ${formatBytes(size)}). Lossless compression preserves all detail.`;
  }
  if (mime.includes("webp")) {
    return `WebP format: ${bpp.toFixed(2)} bytes/pixel (${mp}MP, ${formatBytes(size)}). Modern efficient compression.`;
  }
  return `Compression ratio: ${bpp.toFixed(2)} bytes/pixel (${mp}MP, ${formatBytes(size)}).`;
}

function getCompressionStance(bpp: number, mime: string): MediaStance {
  if (mime.includes("jpeg") && bpp > 2.5) return "supports_authentic";
  if (mime.includes("jpeg") && bpp < 0.15) return "neutral";
  return "neutral";
}

function getVideoDimensionContext(w: number, h: number): string {
  if (w >= 3840 || h >= 2160) return "4K or higher resolution.";
  if (w >= 1920 || h >= 1080) return "Full HD or higher resolution.";
  if (w >= 1280 || h >= 720) return "HD resolution.";
  if (w < 640 && h < 480) return "Low resolution, which can be typical of older content, surveillance, or AI-generated clips.";
  return "Standard definition or web resolution.";
}

function getBitrateContext(bps: number, w: number, h: number): string {
  const pixels = w * h;
  const bppps = pixels > 0 ? bps / pixels : 0;
  if (bppps < 0.05) return "Low bitrate for the resolution, which may indicate heavy compression or low-quality source.";
  if (bppps > 0.3) return "High bitrate for the resolution, suggesting a high-quality source or minimal compression.";
  return "Moderate bitrate typical of web-distributed video.";
}

function getProvenanceContext(url: string): string {
  try {
    const parsed = new URL(url);
    const domain = parsed.hostname.replace(/^www\./, "");
    const tld = domain.split(".").pop()?.toLowerCase();
    if (tld === "gov" || tld === "edu") return "The .gov/.edu domain suggests an institutional source.";
    if (domain.includes("reuters") || domain.includes("apnews") || domain.includes("bbc") || domain.includes("nytimes") || domain.includes("wikipedia")) {
      return "The source domain is associated with established media or reference organizations.";
    }
    if (parsed.protocol === "https:") return "The URL uses HTTPS, indicating an encrypted connection.";
    return "The source domain provides context for assessing credibility.";
  } catch {
    return "";
  }
}
