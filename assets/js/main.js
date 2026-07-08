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

  // Contact form submission (Formspree — replace YOUR_FORM_ID in contact.html)
  var form = document.querySelector('#contact-form');
  if (form) {
    var status = document.querySelector('#form-status');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var action = form.getAttribute('action');

      if (!action || action.indexOf('YOUR_FORM_ID') !== -1) {
        status.textContent = 'Form is not connected yet. Please email us directly, or set up your form endpoint (see README).';
        status.className = 'form-status error';
        return;
      }

      var data = new FormData(form);
      status.textContent = 'Sending...';
      status.className = 'form-status success';

      fetch(action, {
        method: 'POST',
        body: data,
        headers: { Accept: 'application/json' }
      })
        .then(function (response) {
          if (response.ok) {
            status.textContent = 'Thank you — your message has been sent. We will get back to you shortly.';
            status.className = 'form-status success';
            form.reset();
          } else {
            status.textContent = 'Something went wrong. Please try again or email us directly.';
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
