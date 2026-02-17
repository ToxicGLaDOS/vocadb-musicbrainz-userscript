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
const KARENT_MBID = "dae5c6a3-7d3b-4735-9851-4a7c1bb74f98";


class Album {
    // type is whether its an Album/E.P./Single
    constructor(title, artist, circle, releaseDate, type, labels, catalogNumber, tracks, links) {
        this.title = title;
        this.artist = artist;
        this.circle = circle;
        this.releaseDate = releaseDate;
        this.type = type;
        this.labels = labels;
        this.tracks = tracks;
        this.catalogNumber = catalogNumber;
        this.links = links;
    }

    toString() {
        var s = `${this.title}, Release date: ${this.releaseDate}, Type: ${this.type}, Labels: ${this.labels}\n`;
        for (const track of this.tracks) {
            s += track.toString();
            s += "\n";
        }
        return s;
    }

    createForm() {
        const form = document.createElement("form");
        form.action = "https://musicbrainz.org/release/add"
        form.method = "post"
        form.target = "_blank"
        form.id = "importer"

        var name = document.createElement("input");
        name.name = "name";
        name.value = this.title;
        form.appendChild(name);

        var artist = document.createElement("input");
        artist.name = "artist_credit.names.0.artist.name";
        if (this.circle) {
            artist.value = this.circle;
        } else {
            artist.value = this.artist;
        }
        form.appendChild(artist);

        var releaseYear = document.createElement("input");
        releaseYear.name = "events.0.date.year";
        releaseYear.value = (new Date(this.releaseDate)).getFullYear()
        form.appendChild(releaseYear);

        console.log(this.releaseDate);
        var releaseMonth = document.createElement("input");
        releaseMonth.name = "events.0.date.month";
        releaseMonth.value = (new Date(this.releaseDate)).getMonth() + 1 // +1 because .getMonth() is 0 indexed (Jan = 0)
        form.appendChild(releaseMonth);

        var releaseDay = document.createElement("input");
        releaseDay.name = "events.0.date.day";
        releaseDay.value = (new Date(this.releaseDate)).getDate()
        form.appendChild(releaseDay);

        var type = document.createElement("input");
        type.name = "type";
        type.value = this.type;
        form.appendChild(type);

        var label = document.createElement("input");
        label.value = this.labels.name;
        label.name = 'labels.0.name';
        form.appendChild(label);

        var labelMBID = document.createElement("input");
        labelMBID.name = 'labels.0.mbid';
        labelMBID.value = this.labels.mbid;
        form.appendChild(labelMBID);

        var catalogNumber = document.createElement("input");
        catalogNumber.name = 'labels.0.catalog_number';
        catalogNumber.value = this.labels.catalogNumber;
        form.appendChild(catalogNumber);


        for (const track of this.tracks) {
            var trackTitle = document.createElement("input");
            trackTitle.name = `mediums.0.track.${track.trackNumber - 1}.name`;
            trackTitle.value = track.title;
            form.appendChild(trackTitle);

            var trackDuration = document.createElement("input");
            trackDuration.name = `mediums.0.track.${track.trackNumber - 1}.length`;
            trackDuration.value = track.duration;
            form.appendChild(trackDuration);

            var trackArtist = document.createElement("input");
            trackArtist.name = `mediums.0.track.${track.trackNumber - 1}.artist_credit.names.0.name` // TODO: Parse multiple artists out maybe?
            trackArtist.value = track.artist;
            form.appendChild(trackArtist);
        }

        // We need to increment for each link _type_, not each link
        //
        // For example, for bandcamp links we add
        // urls.0.url = <band>.bandcamp.com/<album>
        // urls.0.link_type = 85 (stream for free)
        // and also
        // urls.1.url = <band>.bandcamp.com/<album>
        // urls.1.link_type = 74 (purchase for download)
        //
        // The duplicate links get merged by MusicBrainz automatically
        var index = 0;
        for (const link of this.links) {
            for (const linkType of link.linkTypes) {
                var linkInput = document.createElement("input");
                linkInput.name = `urls.${index}.url`;
                linkInput.value = link.href;
                form.appendChild(linkInput);

                var linkTypeInput = document.createElement("input");
                linkTypeInput.name = `urls.${index}.link_type`;
                linkTypeInput.value = linkType;
                form.appendChild(linkTypeInput);

                index++;
            }

        }

        return form;
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

class Label {
    constructor(name, mbid, catalogNumber) {
        this.name = name;
        this.mbid = mbid; // MusicBrainz ID
        this.catalogNumber = catalogNumber;
    }
}

class Link {
    constructor(href, linkTypes) {
        this.href = href;
        this.linkTypes = linkTypes; // This is an integer ID
    }

    static typeToID(type) {
        switch (type) {
            case "stream for free":
                return 85;
            case "purchase for download":
                return 74;
            default:
                throw `Unexpected type of link "${type}"`
        }
    }
}

// Gets the text content that is contained directly within an element
// Example: Given <div>Foo bar baz<small>Small text</small></div>
// .textContent would return "Foo bar bazSmall text"
// This function returns "Foo bar baz"
function getDirectTextContent(element) {
    return Array.prototype.filter
            .call(element.childNodes, (child) => child.nodeType === Node.TEXT_NODE)
            .map((child) => child.textContent)
            .join('')
            .trim();
}

function getTracks() {
    var trackObjs = [];
    var tracks = document.getElementsByClassName("tracklist-track");

    for (var track of tracks) {
        const trackNumber = parseInt(track.getElementsByClassName("tracklist-trackNumber")[0].textContent);
        var trackTitleElement = track.getElementsByClassName("tracklist-trackTitle")[0];
        // This is some jank to pull out *only* the direct textContent, without any children's
        // textContent. Which happens to only be the track duration in this case
        var trackDuration = getDirectTextContent(trackTitleElement);

        // Remove parens
        trackDuration = trackDuration.match(/\((.*)\)/)[1]

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
    var artist = null;
    var circle = null;
    var type = null;
    var labels = null;
    var releaseDate = null;
    var catalogNumber = null;
    var officialLinks = [];

    for (var tableRow of propertiesTable.childNodes) {
        const rowLabel = tableRow.childNodes[0].textContent;
        const rowData = tableRow.childNodes[1];

        if (rowLabel == "Name") {
            title = rowData.textContent;
        } else if (rowLabel == "Producers") {
            // If only a single producer then
            // we call that the artist
            // TODO: Should we check for circles in this case?
            if (rowData.childNodes.length == 1) {
                artist = rowData.textContent
            }
        } else if (rowLabel == "Circle") {
            circle = rowData.textContent;
        } else if (rowLabel == "Type") {
            if (rowData.textContent == "E.P.") {
                type = "EP"
            }
            else if (rowData.textContent == "Original album") {
                type = "Album"
            } else {
                type = rowData.textContent;
            }
        } else if (rowLabel == "Label(s)") {
            // karent is an especially common case that we can do
            // without trying to look up the labels with the api
            if (rowData.textContent.toLowerCase() == "karent") {
                labels = new Label("KARENT", KARENT_MBID, null);
            }
            else {
                labels = new Label(null, rowData.textContent, null);
            }
        } else if (rowLabel == "Release date") {
            releaseDate = getDirectTextContent(rowData);
        } else if (rowLabel == "Catalog number") {
            labels.catalogNumber = rowData.textContent;
        } else if (rowLabel == "Official links") {
            for (const link of rowData.getElementsByTagName("a")) {
                if (link.href.match(/.*spotify.com.*/)) {
                    officialLinks.push(new Link(link.href, [Link.typeToID("stream for free")]));
                }
                else if (link.href.match(/.*bandcamp.com.*/)) {
                    // TODO (enhancement): Check if they sell physical media and report "purchase for mail-order"
                    officialLinks.push(new Link(link.href, [Link.typeToID("stream for free"), Link.typeToID("purchase for download")]));
                }
            }
        }
    }
    const album = new Album(title, artist, circle, releaseDate, type, labels, catalogNumber, tracks, officialLinks)
    return album;
}

function addImportButton () {
    var mainPanel = document.querySelector('[role="tabpanel"]');

    var importButton = document.createElement("button");
    importButton.textContent = "Import to MusicBrainz"

    importButton.onclick = () => {
        var album = getAlbum();
        var form = album.createForm();

        document.body.insertAdjacentElement("beforebegin", form)
        form.submit();

        console.log(album.toString());
    };

    mainPanel.appendChild(importButton);
}

function main () {
    'use strict';

    addImportButton();
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
