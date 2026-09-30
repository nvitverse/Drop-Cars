(function () {
  'use strict';

  const menuToggle = document.querySelector('.menu-toggle');
  const mobileDropdown = document.getElementById('mobile-nav-dropdown');
  const menuWrap = document.querySelector('.mobile-menu-wrap');

  function setMobileMenuOpen(open) {
    if (!menuToggle || !mobileDropdown) {
      return;
    }
    mobileDropdown.hidden = !open;
    menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    var icon = menuToggle.querySelector('i');
    if (icon) {
      icon.classList.toggle('fa-bars', !open);
      icon.classList.toggle('fa-times', open);
    }
  }

  if (menuToggle && mobileDropdown) {
    menuToggle.addEventListener('click', function (e) {
      e.stopPropagation();
      setMobileMenuOpen(mobileDropdown.hidden);
    });

    document.addEventListener(
      'pointerdown',
      function (e) {
        if (mobileDropdown.hidden || !menuWrap) {
          return;
        }
        if (!menuWrap.contains(e.target)) {
          setMobileMenuOpen(false);
        }
      },
      true
    );

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !mobileDropdown.hidden) {
        setMobileMenuOpen(false);
      }
    });
  }


  var actionBtns = document.querySelectorAll('[data-action]');
  actionBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var row = btn.closest('tr');
      var id = row && row.getAttribute('data-id');
      var status = btn.getAttribute('data-action');
      if (!id || !status) return;
      btn.disabled = true;

      fetch('actions/update-status.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: parseInt(id, 10), status: status })
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.success) {
            var statusCell = row.querySelector('.status');
            if (statusCell) {
              var labels = { confirmed: '✔ Confirmed', fake: '❌ Fake', not_confirmed: '⏳ Not Confirmed' };
              statusCell.textContent = labels[status] || status;
              statusCell.className = 'status status-' + status;
            }
            var actionsCell = row.querySelector('.actions');
            if (actionsCell) actionsCell.innerHTML = '';
          } else {
            alert(res.message || 'Update failed');
            btn.disabled = false;
          }
        })
        .catch(function () {
          alert('Request failed');
          btn.disabled = false;
        });
    });
  });

  // Maintain a clean URL by removing message and related status params from search history
  if (window.history.replaceState) {
    var url = new URL(window.location.href);
    var changed = false;
    var paramsToRemove = ['msg', 'booking_id', 'count'];
    paramsToRemove.forEach(function (p) {
      if (url.searchParams.has(p)) {
        url.searchParams.delete(p);
        changed = true;
      }
    });
    if (changed) {
      window.history.replaceState({ path: url.href }, '', url.href);
    }
  }
})();
