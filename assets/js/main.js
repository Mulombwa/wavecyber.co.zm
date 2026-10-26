// Wave Cyber Security: shared site behaviour (menu, current page, year).
// No third-party code, no network requests, no cookies or storage.
(function () {
  "use strict";

  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".primary-nav");

  function setMenu(open) {
    nav.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      setMenu(!nav.classList.contains("open"));
    });

    // Escape closes the menu and returns focus to the button
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("open")) {
        setMenu(false);
        toggle.focus();
      }
    });

    // A click or tap anywhere outside the menu closes it
    document.addEventListener("click", function (e) {
      if (nav.classList.contains("open") && !nav.contains(e.target) && !toggle.contains(e.target)) {
        setMenu(false);
      }
    });

    // Going back to a wide screen resets the menu
    window.addEventListener("resize", function () {
      if (window.innerWidth > 1040 && nav.classList.contains("open")) setMenu(false);
    });
  }

  var here = window.location.pathname.replace(/\.html$/, "").replace(/\/+$/, "") || "/";
  var links = document.querySelectorAll(".primary-nav a");
  for (var i = 0; i < links.length; i++) {
    if (links[i].getAttribute("href").replace(/\/+$/, "") === here.replace(/^\/$/, "") || links[i].getAttribute("href") === here) links[i].setAttribute("aria-current", "page");
  }

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
