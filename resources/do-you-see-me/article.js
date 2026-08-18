(() => {
  const player = document.querySelector("[data-article-soundtrack]");
  const muteButton = document.querySelector("[data-soundtrack-mute]");
  const status = document.querySelector("[data-soundtrack-status]");

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

  updateMuteButton();
  const playbackAttempt = player.play();
  if (playbackAttempt && typeof playbackAttempt.then === "function") {
    playbackAttempt
      .then(() => setStatus(player.muted ? "The song is playing silently." : "Now playing the companion song."))
      .catch(() => setStatus("Your browser paused automatic playback. Select Play to begin the song."));
  }
})();
