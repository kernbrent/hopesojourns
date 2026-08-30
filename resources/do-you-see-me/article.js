(() => {
  const player = document.querySelector("[data-article-soundtrack]");
  const muteButton = document.querySelector("[data-soundtrack-mute]");
  const status = document.querySelector("[data-soundtrack-status]");
  const soundtrack = player?.closest(".article-soundtrack");
  const lyricsToggle = document.querySelector("[data-lyrics-toggle]");
  const lyricsPanel = document.querySelector("[data-lyrics-panel]");
  const articleRail = document.querySelector("[data-article-rail]");

  if (!player || !muteButton || !status) return;

  const setStatus = message => {
    status.textContent = message;
  };

  const updateMuteButton = () => {
    const isMuted = player.muted || player.volume === 0;
    muteButton.textContent = isMuted ? "Unmute music" : "Mute music";
    muteButton.setAttribute("aria-pressed", String(isMuted));
  };

  muteButton.addEventListener("click", () => {
    const isMuted = player.muted || player.volume === 0;
    if (isMuted) {
      player.muted = false;
      if (player.volume === 0) player.volume = 1;
      setStatus(player.paused ? "Music is unmuted and ready to play." : "Music unmuted.");
    } else {
      player.muted = true;
      setStatus("Music muted.");
    }
    updateMuteButton();
  });

  player.addEventListener("volumechange", updateMuteButton);
  player.addEventListener("play", () => setStatus(player.muted ? "The song is playing silently." : "Now playing the companion song."));
  player.addEventListener("pause", () => {
    if (!player.ended) setStatus("Music paused.");
  });
  player.addEventListener("ended", () => setStatus("The companion song has ended."));

  if (soundtrack && lyricsToggle && lyricsPanel && articleRail) {
    const desktopLayout = window.matchMedia("(min-width: 851px)");

    const syncLyricsPlacement = () => {
      if (desktopLayout.matches) {
        if (lyricsPanel.parentElement !== articleRail) articleRail.append(lyricsPanel);
      } else if (lyricsPanel.previousElementSibling !== soundtrack) {
        soundtrack.insertAdjacentElement("afterend", lyricsPanel);
      }

      articleRail.classList.toggle("lyrics-open", !lyricsPanel.hidden && desktopLayout.matches);
    };

    lyricsToggle.addEventListener("click", () => {
      const shouldOpen = lyricsPanel.hidden;
      lyricsPanel.hidden = !shouldOpen;
      lyricsToggle.textContent = shouldOpen ? "Hide lyrics" : "Show lyrics";
      lyricsToggle.setAttribute("aria-expanded", String(shouldOpen));
      syncLyricsPlacement();
    });

    if (typeof desktopLayout.addEventListener === "function") {
      desktopLayout.addEventListener("change", syncLyricsPlacement);
    } else {
      desktopLayout.addListener(syncLyricsPlacement);
    }
    syncLyricsPlacement();
  }
  updateMuteButton();
  setStatus("Select Play to begin the companion song.");
})();
