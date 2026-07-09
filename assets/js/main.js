// Synergetic Insights and Consulting — site scripts

document.addEventListener('DOMContentLoaded', function () {
  // Footer copyright year
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Mobile nav toggle
  var toggle = document.querySelector('.nav-toggle');
  var links = document.querySelector('.nav-links');

  if (toggle && links) {
    toggle.addEventListener('click', function () {
      links.classList.toggle('open');
    });

    links.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        links.classList.remove('open');
      });
    });
  }

  // Highlight active nav link based on current page
  var currentPage = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(function (link) {
    var href = link.getAttribute('href');
    if (href === currentPage || (currentPage === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  // Contact form submission (posts to contact-handler.php)
  var form = document.querySelector('#contact-form');
  if (form) {
    var status = document.querySelector('#form-status');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var action = form.getAttribute('action');
      var data = new FormData(form);

      status.textContent = 'Sending...';
      status.className = 'form-status success';

      fetch(action, {
        method: 'POST',
        body: data,
        headers: { Accept: 'application/json' }
      })
        .then(function (response) {
          return response.json().then(function (json) {
            return { ok: response.ok, json: json };
          }).catch(function () {
            return { ok: response.ok, json: null };
          });
        })
        .then(function (result) {
          if (result.ok && result.json && result.json.ok) {
            status.textContent = 'Thank you — your message has been sent. We will get back to you shortly.';
            status.className = 'form-status success';
            form.reset();
          } else {
            var errorMessage = (result.json && result.json.error) || 'Something went wrong. Please try again or email us directly.';
            status.textContent = errorMessage;
            status.className = 'form-status error';
          }
        })
        .catch(function () {
          status.textContent = 'Something went wrong. Please try again or email us directly.';
          status.className = 'form-status error';
        });
    });
  }
});
