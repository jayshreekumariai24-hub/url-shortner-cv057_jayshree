// Link shortening and rendering

document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('shortenForm');
  const resultDiv = document.getElementById('result');
  const errorDiv = document.getElementById('error');
  const linksBody = document.getElementById('linksBody');
  const refreshBtn = document.getElementById('refreshLinksBtn');

  async function renderLinks(rows) {
    if (!rows || rows.length === 0) {
      linksBody.innerHTML = `
        <tr>
          <td colspan="6" class="px-6 py-8 text-center text-gray-400 text-lg font-medium">No short links yet. Create your first one above! 🎉</td>
        </tr>
      `;
      return;
    }

    linksBody.innerHTML = rows.map(row => {
      const shortLink = `${window.location.origin}/${row.short_code}`;
      const created = new Date(row.created_at).toLocaleDateString();
      const expiry = row.expires_at ? new Date(row.expires_at).toLocaleDateString() : 'Never';

      return `
        <tr class="table-row">
          <td class="px-6 py-4 whitespace-nowrap font-mono">
            <a href="${shortLink}" target="_blank" class="text-indigo-600 hover:text-indigo-800 font-semibold">${row.short_code}</a>
          </td>
          <td class="px-6 py-4 max-w-[18rem]">
            <div title="${row.original_url}" class="text-sm text-gray-900 truncate max-w-full">${row.original_url}</div>
          </td>
          <td class="px-6 py-4">
            <span class="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-sm font-semibold">${row.clicks}</span>
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${created}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${expiry}</td>
        </tr>
      `;
    }).join('');

    linksBody.querySelectorAll('#linksBody canvas[id^="qr-"]').forEach(canvas => {
      const code = canvas.id.split('-')[1];
      const link = `${window.location.origin}/${code}`;
      QRCode.toCanvas(canvas, link, { width: 32, margin: 0, color: { dark: '#1E40AF', light: '#FFFFFF' } });
    });
  }

  async function loadLinks() {
    try {
      const response = await fetch('/api/links');
      const rows = await response.json();
      renderLinks(rows);
    } catch (err) {
      console.error('Unable to load links', err);
      linksBody.innerHTML = `
        <tr>
          <td colspan="6" class="px-6 py-8 text-center text-red-500 text-lg font-medium">Unable to load links. Refresh the page.</td>
        </tr>
      `;
    }
  }

  form.addEventListener('submit', async function(e) {
    e.preventDefault();

    const urlInput = document.getElementById('urlInput');
    const expiresInDays = form.expiresInDays.value || '7';
    errorDiv.classList.add('hidden');

    try {
      const response = await fetch('/api/shorten', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: urlInput.value.trim(),
          expiresInDays: expiresInDays
        })
      });

      let data;
      try {
        data = await response.json();
      } catch (jsonErr) {
        data = { error: 'Invalid server response' };
      }

      if (response.ok && data.short_url) {
        resultDiv.innerHTML = `
          <div class="flex flex-col sm:flex-row gap-4 items-center">
            <div>
              <p class="font-semibold text-green-800">Success! Your short link:</p>
              <a href="${data.short_url}" target="_blank" class="text-indigo-600 hover:text-indigo-800 font-mono text-lg">${data.short_url}</a>
            </div>
            <div class="flex gap-2">
              <div id="qr-${data.short_code}" class="w-20 h-20"></div>
            </div>
          </div>
        `;
        resultDiv.classList.remove('hidden');
        errorDiv.classList.add('hidden');
        urlInput.value = '';
        QRCode.toCanvas(document.getElementById(`qr-${data.short_code}`), data.short_url, { width: 80 });
        loadLinks();
      } else {
        errorDiv.textContent = data.error || 'Something went wrong';
        errorDiv.classList.remove('hidden');
        resultDiv.classList.add('hidden');
      }
    } catch (err) {
      errorDiv.textContent = 'Network error. Please try again.';
      errorDiv.classList.remove('hidden');
      resultDiv.classList.add('hidden');
    }
  });

  refreshBtn.addEventListener('click', loadLinks);
  loadLinks();
});


