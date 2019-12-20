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
            console.log(eventName)
            if(log.message === "Spacetime Start") {
                inProgressEvents[id] = {
                    name: eventName,
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

(async () => {
    const logs = await loadMatch(1)
    console.log(logs)
    console.log(getSpacetimeEvents(logs))
})()
