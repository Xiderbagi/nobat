document.querySelectorAll('[data-site-photo]').forEach((input) => {
  input.addEventListener('change', async () => {
    const key = input.dataset.sitePhoto;
    const status = document.querySelector(`[data-status="${key}"]`);
    const file = input.files[0];
    if (!file) return;
    status.textContent = 'Uploading…';
    try {
      const r = await window.uploadPhoto(file, `/admin/photos/${key}`);
      const card = input.closest('section');
      let img = card.querySelector('img.photo-preview');
      if (!img) { img = document.createElement('img'); img.className = 'photo-preview'; img.alt = ''; card.querySelector('.photo-empty')?.replaceWith(img); }
      img.src = r.url;
      status.textContent = 'Saved. It now shows on the website.';
    } catch (e) {
      status.textContent = e.code || e.message === 'bad' ? (e.code || "We couldn't read that file. Try a JPG or PNG photo.") : 'Upload failed. Try again.';
    }
    input.value = '';
  });
});
