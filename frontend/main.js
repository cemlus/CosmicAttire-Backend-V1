// ──────────────────────────────────────────────
// CosmicAttire — Profile Client
// Integrates with backend API and populates the
// redesigned tabbed profile card UI.
// ──────────────────────────────────────────────

// ── URL Helpers ──

/** Extract encrypted profile ID from /profile/:encryptedId */
function getProfileIdentifierFromUrl() {
  const segments = window.location.pathname.split('/');
  return segments[2] || null;
}

/** Extract ?token=xyz from query string */
function getTokenFromUrl() {
  return new URLSearchParams(window.location.search).get('token');
}

// ── Current profile data (set by populateProfile, read by saveToPhone) ──
let currentProfileData = null;

// ── Save Contact (vCard) ──

function saveToPhone() {
  const name = document.getElementById('name')?.textContent || 'Unnamed';
  // Real phone and WhatsApp are different fields — pulling the number back
  // out of the wa.me link conflated them and dropped the real phone
  // entirely whenever it differed from (or was set without) WhatsApp.
  const phone = currentProfileData?.phone || '';
  const email = currentProfileData?.email || '';

  const vcf = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${name}`,
    phone ? `TEL;TYPE=CELL:${phone}` : '',
    email ? `EMAIL:${email}` : '',
    'END:VCARD'
  ].filter(Boolean).join('\n');

  const blob = new Blob([vcf], { type: 'text/vcard' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${name.replace(/\s+/g, '_')}.vcf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Social URL Helper ──
// Values are stored as whatever a user typed — a bare handle ("@name"), a
// domain without protocol ("instagram.com/name"), or a full URL. Setting
// the raw DB value as the href directly (the previous behavior) produced
// a broken link for anything but a fully-qualified URL.
function normalizeSocialUrl(platformBase, value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  if (trimmed.includes('.') && !trimmed.startsWith('@')) return `https://${trimmed}`;
  return platformBase + trimmed.replace(/^@/, '');
}

// ── Status / Shell Helpers ──

function setStatus(message) {
  const el = document.getElementById('status-text');
  if (el) el.textContent = message;
}

function setProfileShell(name, role, bio) {
  document.getElementById('name').textContent = name;
  document.getElementById('role').textContent = role;
  document.getElementById('bio').textContent  = bio;

  const img = document.getElementById('profile-image');
  if (img) img.style.display = 'none';
}

// ── Populate UI from API Data ──

function populateProfile(data) {
  currentProfileData = data;

  // ── Identity ──
  document.getElementById('name').textContent = data.name || 'Unnamed';
  document.getElementById('role').textContent  = data.role || 'Unknown';
  document.getElementById('bio').textContent   = data.bio  || 'No bio available.';

  // ── Profile Image ──
  const img = document.getElementById('profile-image');
  if (data.image_url) {
    img.src = data.image_url;
    img.style.display = 'block';
    img.onerror = () => {
      console.warn('Failed to load profile image.');
      img.style.display = 'none';
    };
  } else {
    img.style.display = 'none';
  }

  // ── Social Icons (row) ──
  const instagram = document.getElementById('instagram-link');
  const linkedin  = document.getElementById('linkedin-link');
  const whatsapp  = document.getElementById('whatsapp-link');
  const emailIcon = document.getElementById('email-link');

  if (instagram) {
    const url = normalizeSocialUrl('https://instagram.com/', data.instagram_url);
    if (url) {
      instagram.href = url;
      instagram.style.display = '';
    } else {
      instagram.style.display = 'none';
    }
  }

  if (linkedin) {
    const url = normalizeSocialUrl('https://linkedin.com/in/', data.linkedin_url);
    if (url) {
      linkedin.href = url;
      linkedin.style.display = '';
    } else {
      linkedin.style.display = 'none';
    }
  }

  if (whatsapp && data.whatsapp_number) {
    const number = data.whatsapp_number.replace(/\D/g, '');
    whatsapp.href = `https://wa.me/${number}`;
    whatsapp.style.display = '';
  } else if (whatsapp) {
    whatsapp.style.display = 'none';
  }

  if (emailIcon && data.email) {
    emailIcon.href = `mailto:${data.email}`;
    emailIcon.style.display = '';
  } else if (emailIcon) {
    emailIcon.style.display = 'none';
  }

  // ── Tags (About tab) ──
  const tagsRow = document.getElementById('tags-row');
  if (tagsRow) {
    tagsRow.innerHTML = '';
    const tags = data.tags || data.interests || [];
    if (Array.isArray(tags) && tags.length > 0) {
      tags.forEach(tag => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.textContent = tag;
        tagsRow.appendChild(span);
      });
    }
  }

  // ── Links tab ──
  let hasLinks = false;

  const linkWebsite = document.getElementById('link-website');
  if (linkWebsite) {
    if (data.website_url || data.portfolio_url) {
      linkWebsite.href = data.website_url || data.portfolio_url;
      linkWebsite.style.display = '';
      hasLinks = true;
    }
  }

  const linkPitch = document.getElementById('link-pitch');
  if (linkPitch) {
    if (data.pitch_deck_url) {
      linkPitch.href = data.pitch_deck_url;
      linkPitch.style.display = '';
      hasLinks = true;
    }
  }

  const linkResume = document.getElementById('link-resume');
  if (linkResume) {
    if (data.resume_url) {
      linkResume.href = data.resume_url;
      linkResume.style.display = '';
      hasLinks = true;
    }
  }

  const linkCalendar = document.getElementById('link-calendar');
  if (linkCalendar) {
    if (data.calendar_url || data.booking_url) {
      linkCalendar.href = data.calendar_url || data.booking_url;
      linkCalendar.style.display = '';
      hasLinks = true;
    }
  }

  const noLinksMsg = document.getElementById('no-links-msg');
  if (noLinksMsg) {
    noLinksMsg.style.display = hasLinks ? 'none' : 'block';
  }

  // ── Contact tab ──
  let hasContact = false;

  const contactEmailCard = document.getElementById('contact-email-card');
  const contactEmail     = document.getElementById('contact-email');
  if (contactEmailCard && data.email) {
    contactEmail.textContent = data.email;
    contactEmailCard.style.display = '';
    hasContact = true;
  }

  // Real phone, not WhatsApp — they're different fields and this card was
  // showing whatsapp_number under a "Phone" label regardless of whether a
  // real phone was even set.
  const contactPhoneCard = document.getElementById('contact-phone-card');
  const contactPhone     = document.getElementById('contact-phone');
  if (contactPhoneCard && data.phone) {
    contactPhone.textContent = data.phone;
    contactPhoneCard.style.display = '';
    hasContact = true;
  }

  const contactWhatsappCard = document.getElementById('contact-whatsapp-card');
  const contactWhatsapp     = document.getElementById('contact-whatsapp');
  if (contactWhatsappCard && data.whatsapp_number) {
    contactWhatsapp.textContent = data.whatsapp_number;
    contactWhatsappCard.style.display = '';
    hasContact = true;
  }

  const contactLocationCard = document.getElementById('contact-location-card');
  const contactLocation     = document.getElementById('contact-location');
  if (contactLocationCard && data.location) {
    contactLocation.textContent = data.location;
    contactLocationCard.style.display = '';
    hasContact = true;
  }

  const noContactMsg = document.getElementById('no-contact-msg');
  if (noContactMsg) {
    noContactMsg.style.display = hasContact ? 'none' : 'block';
  }
}

// ── Main Loader ──

async function loadProfile() {
  const profileIdentifier = getProfileIdentifierFromUrl();
  const token = getTokenFromUrl();

  setStatus('Loading profile...');

  if (!profileIdentifier) {
    setStatus('Missing profile ID');
    setProfileShell(
      'Profile link missing',
      'Waiting for encrypted profile ID',
      'The URL must include the encrypted ID generated by the backend.'
    );
    return;
  }

  try {
    const apiUrl = token
      ? `/api/u/${encodeURIComponent(profileIdentifier)}/protected?token=${encodeURIComponent(token)}`
      : `/api/profile/${encodeURIComponent(profileIdentifier)}`;

    const res  = await fetch(apiUrl);
    const json = await res.json();

    if (!res.ok) throw new Error(json.error || 'Failed to load profile');

    const data = json.protectedData || json.publicData;
    console.log('Loaded profile data:', data);

    populateProfile(data);
    setStatus('Profile loaded');

  } catch (err) {
    console.error('Error loading profile:', err.message);
    setStatus(err.message || 'Backend error');
    setProfileShell(
      'Profile unavailable',
      'Backend error',
      'This page is connected to the real backend. Use a valid encrypted profile ID to render profile data.'
    );
  }
}

// ── Tab Switching ──

function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      // Deactivate all
      document.querySelectorAll('.tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

      // Activate clicked
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      const panel = document.getElementById('panel-' + tab.dataset.tab);
      if (panel) panel.classList.add('active');
    });
  });
}

// ── Connect Button ──
// This visitor has no Cosmic Attire account, so there's no in-app request
// to send — the honest version of "Connect" here is actually reaching out
// via whatever contact info is on the profile, not a fake success
// animation with no real effect behind it.

function initConnectButton() {
  const btn = document.getElementById('connect-btn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const data = currentProfileData;
    const name = document.getElementById('name')?.textContent || 'this profile';

    if (data?.email) {
      const subject = encodeURIComponent(`Let's connect on Cosmic Attire`);
      const body = encodeURIComponent(`Hi ${data.name || ''},\n\nI tapped your Cosmic ring and wanted to connect!`);
      window.location.href = `mailto:${data.email}?subject=${subject}&body=${body}`;
    } else if (data?.whatsapp_number) {
      const number = data.whatsapp_number.replace(/\D/g, '');
      const text = encodeURIComponent(`Hi ${data.name || ''}, I tapped your Cosmic ring and wanted to connect!`);
      window.open(`https://wa.me/${number}?text=${text}`, '_blank', 'noopener,noreferrer');
    } else {
      alert(`${name} hasn't shared contact details yet — check the Links tab instead.`);
    }
  });
}

// ── Init ──

document.addEventListener('DOMContentLoaded', () => {
  // Entrance animation
  const card = document.getElementById('profile-card');
  if (card) card.classList.add('entered');

  // Wire up UI
  initTabs();
  initConnectButton();

  // Save contact button
  const saveBtn = document.getElementById('save-contact-btn');
  if (saveBtn) saveBtn.addEventListener('click', saveToPhone);

  // Load real data from backend
  loadProfile();
});
