(function () {
  const habitatLink = document.querySelector("[data-habitat-link]");
  if (!habitatLink) {
    return;
  }

  const referrer = document.referrer || "";
  const fromHabitat = /\/dashboard\.php(?:\?|$)/i.test(referrer);

  if (fromHabitat) {
    habitatLink.hidden = false;
  }
})();
