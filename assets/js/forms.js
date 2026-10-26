// Wave Cyber Security: contact and incident forms.
//
// Checks the form in the browser, then posts it to send.php on this same site,
// which emails it to us. Without JavaScript the form still works: the browser
// posts it to send.php and is sent on to a "message sent" page.
// No cookies, no storage, no third-party code.
(function () {
  "use strict";

  var FALLBACK_EMAIL = "info@wavecyber.co.zm";
  var TIMEOUT_MS = 20000;

  function $(form, name) { return form.elements[name]; }

  function clearErrors(form) {
    var errs = form.querySelectorAll(".field-error");
    for (var i = 0; i < errs.length; i++) errs[i].parentNode.removeChild(errs[i]);
    var bad = form.querySelectorAll("[aria-invalid]");
    for (var j = 0; j < bad.length; j++) { bad[j].removeAttribute("aria-invalid"); bad[j].removeAttribute("aria-describedby"); }
  }

  function addError(input, message, id) {
    var p = document.createElement("p");
    p.className = "field-error";
    p.id = id;
    p.textContent = message;
    var anchor = input.closest(".field, .consent-field") || input.parentNode;
    anchor.appendChild(p);
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", id);
  }

  // Same rules as send.php, so the page never accepts something the server refuses.
  var EMAIL_RE = /^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
  var PHONE_RE = /^[0-9 +().\-]{5,40}$/;

  function validate(form) {
    var problems = [];
    var kind = form.getAttribute("data-enquiry-form");
    var name = $(form, "name"), email = $(form, "email"), phone = $(form, "phone");
    var message = $(form, "message"), consent = $(form, "consent");
    var nameV = name.value.trim(), emailV = email.value.trim(), phoneV = phone.value.trim(), msgV = message.value.trim();

    if (!nameV) problems.push([name, "Please enter your name."]);
    else if (nameV.length > 100) problems.push([name, "Please use 100 characters or fewer for your name."]);

    if (!emailV) {
      if (kind === "contact") problems.push([email, "Please enter your email address so we can reply."]);
    } else if (emailV.length > 254 || !EMAIL_RE.test(emailV)) {
      problems.push([email, "That email address does not look right."]);
    }

    if (phoneV && !PHONE_RE.test(phoneV)) {
      problems.push([phone, "Please use numbers only, with spaces, + or dashes if you like (5 to 40 characters)."]);
    } else if (kind === "incident" && !emailV && !phoneV) {
      problems.push([phone, "Please give a phone number or an email address so we can reach you."]);
    }

    if (!msgV) problems.push([message, kind === "incident" ? "Please describe what you are seeing." : "Please write a message."]);
    else if (message.value.replace(/\r\n?/g, "\n").length > 4000) problems.push([message, "Please keep your message under 4000 characters."]);

    if (!consent.checked) problems.push([consent, "Please tick the box if you are happy for us to use your details in this way."]);
    return problems;
  }

  // Show a list of [input, message] pairs and move focus to the first.
  function showProblems(form, problems) {
    problems.forEach(function (p, i) { addError(p[0], p[1], "err-" + form.id + "-" + i); });
    if (problems.length) problems[0][0].focus();
  }

  function setStatus(box, kind, nodes) {
    box.className = "form-status" + (kind ? " " + kind : "");
    while (box.firstChild) box.removeChild(box.firstChild);
    nodes.forEach(function (n) { box.appendChild(typeof n === "string" ? document.createTextNode(n) : n); });
  }

  function mailLink() {
    var a = document.createElement("a");
    a.href = "mailto:" + FALLBACK_EMAIL;
    a.textContent = FALLBACK_EMAIL;
    return a;
  }

  function handle(form) {
    var status = form.querySelector(".form-status");
    var button = form.querySelector("button[type=submit]");
    var kind = form.getAttribute("data-enquiry-form");

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearErrors(form);
      setStatus(status, "", []);

      var problems = validate(form);
      if (problems.length) {
        showProblems(form, problems);
        setStatus(status, "fail", ["Please fix the " + (problems.length === 1 ? "item" : "items") + " marked below and send again."]);
        return;
      }

      button.disabled = true;
      setStatus(status, "", ["Sending..."]);

      var controller = typeof AbortController === "function" ? new AbortController() : null;
      var timer = setTimeout(function () { if (controller) controller.abort(); }, TIMEOUT_MS);

      fetch(form.getAttribute("action"), {
        method: "POST",
        body: new FormData(form),
        headers: { "Accept": "application/json" },
        credentials: "same-origin",
        signal: controller ? controller.signal : undefined
      })
        .then(function (r) {
          return r.json().then(function (j) { return { ok: r.ok && j && j.ok === true, error: j && j.error, fields: j && j.fields }; });
        })
        .then(function (res) {
          clearTimeout(timer);
          if (res.ok) {
            form.reset();
            setStatus(status, "ok", [kind === "incident"
              ? "Thank you. Your report has been received. If this is urgent, please also phone us."
              : "Thank you. Your message has been received and we will reply to the email address you gave."]);
          } else if (res.error === "invalid") {
            var list = [];
            Object.keys(res.fields || {}).forEach(function (k) {
              var el = k === "form" ? null : form.elements[k];
              if (el) list.push([el, res.fields[k]]);
            });
            if (list.length) {
              showProblems(form, list);
              setStatus(status, "fail", ["Please fix the " + (list.length === 1 ? "item" : "items") + " marked below and send again."]);
            } else {
              setStatus(status, "fail", ["Some of your details were not accepted. Please check the form and try again, or email us at ", mailLink(), "."]);
            }
          } else {
            setStatus(status, "fail", ["Sorry, your message could not be sent. Please try again, or email us at ", mailLink(), "."]);
          }
        })
        .catch(function () {
          clearTimeout(timer);
          setStatus(status, "fail", ["Sorry, your message could not be sent. Please try again, or email us at ", mailLink(), "."]);
        })
        .then(function () { button.disabled = false; });
    });
  }

  var forms = document.querySelectorAll("form[data-enquiry-form]");
  for (var i = 0; i < forms.length; i++) handle(forms[i]);
})();
