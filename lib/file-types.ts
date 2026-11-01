// Pure helpers shared by the browser and the server (no imports, nothing secret).
export const ALLOWED_EXTENSIONS = ['pdf', 'txt', 'docx', 'doc', 'pptx', 'ppt', 'png', 'jpg', 'jpeg', 'webp'];

const EXT_BY_TYPE: Record<string, string> = {
  'application/pdf': 'pdf', 'text/plain': 'txt', 'application/msword': 'doc', 'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
};
/** The file's type from its name, or, when a phone gives a name with no extension (common with downloads and camera shots), from its media type. */
export function extensionOf(file: { name: string; type?: string }): string {
  const fromName = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  if (ALLOWED_EXTENSIONS.includes(fromName)) return fromName;
  return EXT_BY_TYPE[(file.type || '').toLowerCase()] || fromName;
}
/** The same file with a proper extension on its name, so the server can tell what it is. */
export function withExtension(file: File): File {
  const ext = extensionOf(file);
  if (!ext || file.name.toLowerCase().endsWith(`.${ext}`)) return file;
  return new File([file], `${file.name.replace(/\.[^.]*$/, '') || 'upload'}.${ext}`, { type: file.type, lastModified: file.lastModified });
}

/** Browsers inside other apps (Facebook, Instagram, TikTok, WeChat, Line...) often cannot open a file picker at all. */
export function isInAppBrowser(ua: string): boolean {
  return /FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|Line\/|MicroMessenger|Snapchat|Twitter|LinkedInApp|GSA\//i.test(ua) || /; wv\)/.test(ua);
}

