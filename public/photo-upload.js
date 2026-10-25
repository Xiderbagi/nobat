// Resizes a picked photo in the browser (max 1600 px, JPEG) and uploads it. iPhone HEIC photos are converted too.
// Resizing also removes hidden location data that phone cameras put in photos.
window.uploadPhoto = async (file, url) => {
  const MAX = 1600;
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { throw new Error('bad'); }
  const k = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * k);
  canvas.height = Math.round(bitmap.height * k);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('bad');
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'error'), { code: data.error });
  return data;
};
