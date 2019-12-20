const pageStart = 0;
const pageEnd = 32;

async function loadMatch(match) {
    const response = await fetch(`http://localhost:9000/${match}.log`)
    if(!response.ok) {
        console.error("The response wasn't okay", response)
        return
    }

    const matchText = await response.text()
    const logMessages = []
    for(const logMessage of matchText.split("\n")) {
        try {
            if(logMessage) {
                logMessages.push(JSON.parse(logMessage))
            }
        } catch(e) {
            console.warn("Uh maybe the json parsing didn't go so well there", e, logMessage)
        }
    }
    return logMessages
}

function getSpacetimeEvents(logs) {
    const spacetimeEvents = []
    const inProgressEvents = {}
    for(const log of logs) {
        if(log.message === "Spacetime Start" || log.message === "Spacetime End") {
            const eventName = log.fields.find(field => field.name === "EventName").value
            const id = log.fields.find(field => field.name === "ID").value
            if(log.message === "Spacetime Start") {
                inProgressEvents[id] = {
                    name: eventName,
                    id: id,
                    parentID: log.fields.find(field => field.name === "ParentID").value,
                    startTime: log.timestamp,
                    endTime: null,
                    children: [],
                }
            } else {
                inProgressEvents[id].endTime = log.timestamp
            }
        }
    }

    for(const event of Object.values(inProgressEvents)) {
        if(event.parentID === -1) {
            spacetimeEvents.push(event)
        } else {
            inProgressEvents[event.parentID].children.push(event)
        }
    }

    return spacetimeEvents
}

function sortIntoTracks(spacetimeEvents) {
    const sortedTracks = []
    for(const event of spacetimeEvents) {
        let trackIndex = 0
        while(trackIndex < sortedTracks.length) {
            const track = sortedTracks[trackIndex]
            let overlapped = false
            for(const trackEvent of track) {
                if(doEventsOverlap(event, trackEvent)) {
                    overlapped = true
                    break
                }
            }
            if(!overlapped) {
                track.push(event)
                break
            } else {
                trackIndex++
            }
        }

        if(trackIndex >= sortedTracks.length) {
            sortedTracks.push([event])
        } 
    }

    return sortedTracks
}

function getHeightOfEvents(events, levels, currentLevel) {
    sortedTracks = sortIntoTracks(events)
    let height = 0
    for(const track of sortedTracks) {
        const eventHeights = track.map(event => getHeightOfEvent(event, levels, currentLevel + height))
        const maxHeight = eventHeights.reduce((currentMax, height) => height > currentMax ? height : currentMax)
        height += maxHeight
    }

    return height
}

function getHeightOfEvent(event, levels, currentLevel) {
    levels[event.id] = currentLevel
    return 1 + getHeightOfEvents(event.children, levels, currentLevel + 1)
}

function getLevels(events) {
    const levels = {}
    getHeightOfEvents(events, levels, 0)
    return levels
}

function doEventsOverlap(event1, event2) {
    return event1.startTime < event2.endTime && event1.endTime > event2.startTime
}

(async () => {
    const logs = await loadMatch(3)
    const events = getSpacetimeEvents(logs)
    const levels = getLevels(events)
    console.log(logs)
    console.log(events)
    console.log(sortIntoTracks(events))
    console.log(levels)

    function renderEvent(event) {
        const div = document.createElement("div")
        div.textContent = event.name
        div.style.position = "absolute"
        div.style.height = "20px"
        div.style.backgroundColor = "#999"
        div.style.width = `${(event.endTime - event.startTime) / (pageEnd - pageStart) * 100}%`
        div.style.left = `${event.startTime / (pageEnd - pageStart) * 100}%`
        div.style.top = `${30 * levels[event.id]}px`
        document.body.appendChild(div)
        for(const child of event.children) {
            renderEvent(child)
        }
    }
    for(const event of events) {
        renderEvent(event)
    }
})()
