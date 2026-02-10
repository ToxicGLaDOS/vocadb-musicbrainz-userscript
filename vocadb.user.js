// ==UserScript==
// @name         VocaDB MusicBrainz Importer
// @namespace    https://blackolivepineapple.pizza
// @version      0.1
// @description  Allows you easily import albums from VocaDB into MusicBrainz
// @match        https://vocadb.net/Al/*
// @grant        none
// ==/UserScript==

const TARGET_SELECTOR = ".tracklist-track";
const CHECK_INTERVAL = 500; // Check every 500ms
const MAX_WAIT = 10000; // Stop after 10 seconds (10,000ms)
let elapsedTime = 0;

class Album {
    // type is whether its an Album/E.P./Single
    constructor(title, releaseDate, type, labels, tracks) {
        this.title = title;
        this.releaseDate = releaseDate;
        this.type = type;
        this.labels = labels;
        this.tracks = tracks;
    }

    toString() {
        var s = `${this.title}, Release date: ${this.releaseDate}, Type: ${this.type}, Labels: ${this.labels}\n`;
        for (const track of this.tracks) {
            s += track.toString();
            s += "\n";
        }
        return s;
    }
}

class Track {
    constructor(trackNumber, title, artist, duration) {
        this.trackNumber = trackNumber;
        this.title = title;
        this.artist = artist;
        this.duration = duration;
    }

    toString() {
        return `${this.trackNumber}. Title: ${this.title}, Artist: ${this.artist}, Duration: ${this.duration}`;
    }
}

function getTracks() {
    var trackObjs = [];
    var tracks = document.getElementsByClassName("tracklist-track");

    for (var track of tracks) {
        const trackNumber = track.getElementsByClassName("tracklist-trackNumber")[0].textContent;
        var trackTitleElement = track.getElementsByClassName("tracklist-trackTitle")[0];
        // This is some jank to pull out *only* the direct textContent, without any children's
        // textContent. Which happens to only be the track duration in this case
        const trackDuration = Array.prototype.filter
            .call(trackTitleElement.childNodes, (child) => child.nodeType === Node.TEXT_NODE)
            .map((child) => child.textContent)
            .join('')
            .trim();

        const artist = trackTitleElement.getElementsByTagName("small")[0].textContent;
        var trackTitle = trackTitleElement.getElementsByTagName("span")[0].getElementsByTagName("a")[0].innerHTML;
        trackObjs.push(new Track(trackNumber, trackTitle, artist, trackDuration));
    }

    return trackObjs;
}

function getAlbum() {
    var tracks = getTracks();
    var propertiesTable = document.getElementsByClassName("properties")[0].getElementsByTagName("tbody")[0];
    var title = null;
    var type = null;
    var labels = [];
    var releaseDate = null;

    for (var tableRow of propertiesTable.childNodes) {
        const rowLabel = tableRow.childNodes[0].textContent;
        const rowData = tableRow.childNodes[1].textContent;

        if (rowLabel == "Name") {
            title = rowData;
        } else if (rowLabel == "Type") {
            type = rowData;
        } else if (rowLabel == "Label(s)") {
            labels.push(rowData);
        } else if (rowLabel == "Release date") {
            releaseDate = rowData;
        }
    }
    const album = new Album(title, releaseDate, type, labels, tracks)
    return album;
}

function main () {
    'use strict';

    var album = getAlbum();
    console.log(album.toString());
}


// Poll to see if TARGET_SELECTOR is loaded yet
const intervalId = setInterval(() => {
  console.log("Trying");
  elapsedTime += CHECK_INTERVAL;
  const targetElement = document.querySelector(TARGET_SELECTOR);
 
  if (targetElement) {
    console.log("Element found! Executing code...");
    clearInterval(intervalId); // Stop polling
    main();
  } else if (elapsedTime >= MAX_WAIT) {
    console.log("Timeout: Element not found.");
    clearInterval(intervalId); // Stop polling
  }
}, CHECK_INTERVAL);
