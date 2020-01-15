const pageStart = 0;
const pageEnd = 40;
const verticalPadding = 10;
let seriesToPlot = [];
let dataSeries = {}

window.addEventListener("DOMContentLoaded", () => {
    (async () => {
        const logs = await loadMatch(4)
        const events = getSpacetimeEvents(logs)
        const levels = getLevels(events)
        dataSeries = getDataSeries(logs)
        // console.log(logs)
        // console.log(events)
        // console.log(sortIntoTracks(events))
        // console.log(levels)

        function renderEvent(event) {
            const div = document.createElement("div")
            div.textContent = event.name
            div.style.position = "absolute"
            div.style.height = "20px"
            div.style.backgroundColor = "#999"
            div.style.width = `${(event.endTime - event.startTime) / (pageEnd - pageStart) * 100}%`
            div.style.left = `${event.startTime / (pageEnd - pageStart) * 100}%`
            div.style.top = `${30 * levels[event.id]}px`
            document.querySelector("#spacetime").appendChild(div)
            for(const child of event.children) {
                renderEvent(child)
            }
        }
        for(const event of events) {
            renderEvent(event)
        }
        
        console.log(dataSeries)
        
        function renderOnResize() {
            for(const event of events) {
                renderEvent(event)
            }
            renderTopBar()
            for(let series of seriesToPlot) {
                series.canvas.setAttribute("width", document.body.clientWidth)
            }
            refresh()
            document.querySelector("#overlayCanvas").setAttribute("width", document.body.clientWidth)
            document.querySelector("#overlayCanvas").setAttribute("height", window.innerHeight);
        }
        window.addEventListener("resize", renderOnResize)
    })()
    
    document.querySelector("#addSeriesButton").addEventListener("click", () => {
        console.log("do it")
        const canvas = document.createElement("canvas")
        canvas.setAttribute("width", document.body.clientWidth)
        canvas.setAttribute("height", 200)

        seriesToPlot.push({
            name: document.querySelector("#seriesSelector").value,
            canvas: canvas,
        })
        refresh()
    })
    
    renderTopBar()

    const overlayCanvas = document.querySelector("#overlayCanvas")
    overlayCanvas.setAttribute("width", document.body.clientWidth)
    overlayCanvas.setAttribute("height", window.innerHeight);

    window.addEventListener("mousemove", e => {
        const ctx = overlayCanvas.getContext("2d")
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
        overlayCanvas
        drawLine(ctx, e.clientX, 0, e.clientX, overlayCanvas.height, 2)
    })
})


function refresh() {
    if(document.querySelector("#data").children.length !== seriesToPlot.length) {
        document.querySelector("#data").innerHTML = ""
        for(const series of seriesToPlot) {
            const div = document.createElement("div")
            div.setAttribute("data-series", series.name)
            div.setAttribute("class", "graphDiv")
            document.querySelector("#data").appendChild(div)
            div.appendChild(series.canvas)

            const closeButton = document.createElement("button")
            closeButton.innerHTML = "x"
            closeButton.setAttribute("class", "closeButton")
            closeButton.addEventListener("click", () => {
                seriesToPlot = seriesToPlot.filter(currentSeries => currentSeries.name !== series.name)
                refresh()
            })

            div.appendChild(closeButton)
        }
    } 
    
    for(const series of seriesToPlot) {
        graphDataOnCanvas(dataSeries[series.name], series.canvas)
    }
}

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

    let dataSeriesNames = []
    for(const logMessage of logMessages) {
        for(const logField of logMessage.fields) {
            if(logField.name.toLowerCase().includes("data")) {
                let redundant = false
                for(const seriesName of dataSeriesNames) {
                    if(seriesName === logField.name) {
                        redundant = true
                    }
                }
                if(!redundant) {
                    dataSeriesNames.push(logField.name)
                }
            }
        }
    }

    for(let dataSeriesName of dataSeriesNames) {
        const option = document.createElement("option")
        option.setAttribute("value", dataSeriesName.slice(5))
        document.querySelector("#seriesSelector").appendChild(option)
        option.innerHTML = dataSeriesName.slice(5)
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

function getDataSeries(logs) {
    const dataSeries = {}
    for(const log of logs) {
        dataFields = log.fields.filter(field => field.name.toLowerCase().startsWith("data"))
        for(const dataField of dataFields) {
            const nameOfSeries = dataField.name.slice(5)
            if(dataSeries[nameOfSeries] === undefined) {
                dataSeries[nameOfSeries] = {
                    points: []
                }
            }

            dataSeries[nameOfSeries].points.push({ time: log.timestamp, value: dataField.value })
        }
    }

    return dataSeries
}

function graphDataOnCanvas(dataSeries, canvas) {
    const ctx = canvas.getContext("2d")
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    const maxValue = Math.max(...dataSeries.points.map(point => point.value))
    const minValue = Math.min(...dataSeries.points.map(point => point.value))

    function convertToPixels(point) {
        const x = (point.time - pageStart) / (pageEnd - pageStart) * canvas.width
        const y = (maxValue - point.value)  / (maxValue - minValue) * (canvas.height - verticalPadding * 2) + verticalPadding
        return [x, y]
    }

    for(const point of dataSeries.points) {
        const [x, y] = convertToPixels(point)
        drawCircle(ctx, x, y, 5)
    }

    for(let i = 1; i < dataSeries.points.length; i++) {
        const point1 = dataSeries.points[i - 1]
        const point2 = dataSeries.points[i]
        const [x1, y1] = convertToPixels(point1)
        const [x2, y2] = convertToPixels(point2)

        drawLine(ctx, x1, y1, x2, y2)
    }

    drawLine(ctx, 5, verticalPadding, 5, canvas.height - verticalPadding)
    for(let i = 0; i < 5; i++) {
        let paddingHeight = (canvas.height - verticalPadding * 2)
        let height = i * paddingHeight / 4 + verticalPadding
        let heightInUnits = (paddingHeight - height) / paddingHeight * (maxValue - minValue) + minValue
        drawLine(ctx, 5, height, 20, height)
        drawText(ctx, Math.round(heightInUnits * 100) / 100, {x: 27, y: height + 5})
        drawLine(ctx, 60, height, canvas.width, height, 1, "#aaa")
    }
}

function doEventsOverlap(event1, event2) {
    return event1.startTime < event2.endTime && event1.endTime > event2.startTime
}

function renderTopBar() {
    let canvas = document.querySelector("#topBarCanvas")
    canvas.setAttribute("width", document.body.clientWidth)
    canvas.setAttribute("height", 50)
    let ctx = canvas.getContext("2d");
    // drawLine(ctx, 0, 0, canvas.width, 0, 20, "#")
    for(let i = 0; i < 20; i++) {
        horizontalPos = i * canvas.width / 19
        horizontalPosInUnits = horizontalPos / canvas.width * (pageEnd - pageStart) + pageStart
        drawLine(ctx, horizontalPos, 0, horizontalPos, 10)
        drawText(ctx, Math.round(horizontalPosInUnits * 10) / 10, {x: horizontalPos - 12, y: 25})
    }
}

function drawCircle(context, x, y, radius, color = 'black') {
    context.beginPath();
    context.arc(
        x,
        y,
        radius,
        0,
        2 * Math.PI,
        false
    );
    context.fillStyle = color;
    context.fill();
}

function drawLine(context, x1, y1, x2, y2, thickness = 2, color = 'black') {
    context.beginPath();
    context.moveTo(
        x1,
        y1
    );
    context.lineTo(
        x2,
        y2
    );
    context.lineWidth = thickness;
    context.strokeStyle = color;
    context.stroke();
}

function drawText(context, text, origin, color = 'black', size = 14, font = 'Arial') {
    context.font = size + 'px ' + font;
    context.fillStyle = color;
    context.fillText(
        text,
        origin.x,
        origin.y
    );
}
