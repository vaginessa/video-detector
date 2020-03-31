// This should check whether a video is currently played and change the title accordingly
// @TODO: fix suspend setting propagation: find _one_ way to do this, and the stick to that.
// 

var supportedSites = ['youtube', 'vimeo', 'netflix', 'orf'];

var default_prefix = "Playing ~ ";
var titlePrefix = default_prefix;
var oldPrefix = titlePrefix;

var globalSuspended = false;

const observer = new MutationObserver(mutationHandler);

// start
init();

/*
 * init()
 * Initialize script
 */
function init() {
  console.log("Starting video_detect.js");
  browser.storage.onChanged.addListener(onSettingChanged);
  browser.runtime.onMessage.addListener(handleMessage);
  // need to make sure that settings are applied prior to initializing player
  initSettings()
    .then(initPlayer); 
}


/*
 * initPlayer()
 * Check if a player exists on site.
 * Function reschedules itself periodically until a player is found.
 * @TODO: rethink this concept. could this be event-based?
 */
function initPlayer() {
  console.log("checking player status...");
  var player = getPlayer();
  
  if (player != null) {
    if (!globalSuspended) setListeners(true);
  } else {
    setTimeout(initPlayer, 1000);
  }
}


/*
 * getPlayer()
 * Return the current video player object, or null if none is found
 */
function getPlayer() {
  var player = null;
  switch (getSiteName(document.URL)) {
    case "youtube": {
      if (document.getElementById("movie_player") != null) {
        player = document.getElementById("movie_player").querySelector('video');
      }
    } break;
    case "vimeo": {
      if (document.getElementsByClassName("vp-controls-wrapper").length != 0) {
        player = document.querySelector('div[class^="player "]').querySelector('video');
      }
    } break;
    case "netflix": {
      if (document.getElementsByClassName("PlayerControlsNeo__button-control-row").length != 0) {
        player = document.querySelector('div[class^="VideoContainer"]').querySelector('video');
      }
    } break;
    case "orf": {
      if (document.getElementsByClassName("video_wrapper").length != 0) {
        player = document.querySelector('div[class^="video_wrapper"]').querySelector('video');
      }
    } break;
    default: console.log("invalid site");
  }
  return player;
}

/*
 * setTitle(bool)
 * Add or remove the current Tab's title prefix, depending on parameter
 */
function setTitle(playing) {
  if (playing) {
    if (!document.title.startsWith(titlePrefix) && !document.title.startsWith(oldPrefix)) {
      document.title = titlePrefix + document.title;
    } else if (document.title.startsWith(oldPrefix)) {
      document.title = document.title.replace(oldPrefix, titlePrefix);
    }
  } else {
    console.log("stopped video");
    try {
      var re = RegExp("^(" + fixRegex(titlePrefix) + ")|^(" + fixRegex(oldPrefix) + ")", "g");
      console.log(re);
      console.log(document.title);
      if (re.exec(document.title) != null) {
        console.log("found prefix in title");
        document.title = document.title.replace(re, "");
      }
    } catch(e) {
      console.log(e);
    }
  }
  oldPrefix = titlePrefix;
}


/*
 * getSiteName()
 * Return a string for each supported site
 */
function getSiteName(url) {
  var i;
  for (i = 0; i < supportedSites.length; i++) {
    if (url.includes(supportedSites[i])) {
      return supportedSites[i];
    }
  }
  return "other";
}

/*
 * setListeners()
 * Enable or disable player event monitoring
 */
function setListeners(on) {
  // install listeners for video play/paused
  var player = getPlayer();
  if (player != null) {
    if (on) {
      player.addEventListener("pause", onPause);
      player.addEventListener("play", onPlay);
      player.addEventListener("loadeddata", onPlayerReload);
      setPlayerChangeHandler(true);
      console.log("Set status listeners");
      if (!player.paused) {
        // if player is already running
        onPlay();
      }
    } else {
      player.removeEventListener("pause", onPause);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("loadeddata", onPlayerReload);
      setPlayerChangeHandler(false);
      console.log("Disconnected status listeners");
      if (!player.paused) {
        setTitle(false);
      }
    }
  }
}


/*
 * videoRunning()
 * Return true if video is running in current player, false otherwise
 */
function videoRunning() {
  var player = getPlayer();
  if (player != null) {
    return !player.paused;
  }
  return false;
}

/*
 * fixRegex()
 * Return a rexeg-friendly version of the given string 
 */
function fixRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


//
// CALLBACK HANDLER
//


/*
 * onPause()
 * Callback handler for video player pause event.
 */
function onPause() {
  console.log("video paused");
  setTitle(false);
}


/*
 * onPlay()
 * Callback handler for video player play event.
 */
function onPlay() {
  console.log("video playing");
  setTitle(true);
}


function onError(e) {
  console.log("Error: " + e);
}


/*
 * onSettingChanged()
 * Event handler for settings changes event.
 */
function onSettingChanged() {
  console.log("preferences changed");
  browser.storage.local.get(["modifier", "suspended"])
    .then(function(pref) {
      console.log("applying settings");
      if (pref.modifier) {
        titlePrefix = pref.modifier;
      } else {
        // no modifier found
        titlePrefix = default_prefix;
      }
      globalSuspend = pref.suspended;
      setTitle(videoRunning() && !pref.suspended);
    }, onError);
}

/*
 * initSettings()
 * Apply settings from local storage
 */
function initSettings() {
  // return a Promise to make the it possible
  // to wait for this function's completion (in init())
  // before doing other init stuff
  return new Promise((resolve, reject) => {
    var applySetting = function(pref) {
      console.log("applying settings");
      console.log(pref);
      if ('modifier' in pref) {
        titlePrefix = pref.modifier;
      } else {
        // no modifier found
        titlePrefix = default_prefix;
      }
      globalSuspended = pref.suspended | false;
      resolve("success");
    };

    console.log("retrieving settings");
    browser.storage.local.get(["modifier", "suspended"])
      .then(applySetting, onError);
  });
}



/*
 * onPlayerReload()
 * Event handler for a player-internal reload.
 * This happens e.g. on youtube if autoplay is active.
 * This handler is used to detect a new autoplaying video.
 * @TODO: check if there is a way to catch event on when title is set.
 */
function onPlayerReload() {
  var player = getPlayer();
  if ((player != null) && !player.paused) {
    console.log("autostart detected");
    setTimeout(onPlay, 1000); // hacky hack: site name might not be fully loaded when video is loaded, wait a bit
  }
}


/*
 * mutationHandler()
 * Handle a mutation event.
 * In case the player's src attribute has changed, reinit the player by calling initPlayer.
 */
function mutationHandler(mutationList, observer) {
  console.log("data mutation observed!");
  
  for (let mutation of mutationList) {
    if (mutation.type == 'attributes') {
      console.log("attribute changed: " + mutation.attributeName);
      console.log(mutation);
      if (mutation.attributeName == "src") {
        initPlayer();
      }
    } 
  }
}


/*
 * setPlayerChangedHandler()
 * Set up event handler for current player
 * to trigger when the player's attributes have changed.
 */
function setPlayerChangeHandler(start) {
  if (start) {
    const player = getPlayer();
    const config = { attributeFilter: ['src'] };

    //const observer = new MutationObserver(mutationHandler);
    observer.observe(player, config);
  } else {
    observer.disconnect();
  }
}

/*
 * handleMessage()
 * Deal with a message from background script
 * @TODO: add error handling
 */
function handleMessage(message) {
  // handle a message from background script
  if ('suspend' in message) {
    globalSuspended = message.suspend;
    if (message.suspend) {
      setListeners(false);
    } else {
      initPlayer();
    }
  }
  console.log("done");
}

