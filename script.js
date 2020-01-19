// Log viewer with spacetime map viewing capabilities

// Variables that represent the horizontal (time) axis range
let pageStart = 0;
let pageEnd = 40;

// The padding in the vertical direction on all of the graphs
const verticalPadding = 10;

// State variables for the series currently being plotted and a list of all
// of the known data series from the log file
let seriesToPlot = [];
let dataSeries = {}

// State variables for time-axis resizing
let resizing = false
let mouseStart

// This runs when the page loads once
window.addEventListener("DOMContentLoaded", () => {
    (async () => {
        // Load the log file and parse some data out of it
        const logs = await loadMatch(4)
        const events = getSpacetimeEvents(logs)
        const levels = getLevels(events)
        dataSeries = getDataSeries(logs)

        /**
         * Renders a single spacetime map on screen. Requires the variables
         * above (such as levels)
         * @param {*} event the spacetime event to render on screen
         */
        function renderEvent(event) {
            const div = document.createElement("div")
            div.textContent = event.name
            div.style.position = "absolute"
            div.style.height = "20px"
            div.style.backgroundColor = "#999"
            div.style.width = `${(event.endTime - event.startTime) / (pageEnd - pageStart) * 100}%`
            div.style.left = `${(event.startTime - pageStart) / (pageEnd - pageStart) * 100}%`
            div.style.top = `${30 * levels[event.id]}px`
            document.querySelector("#spacetime").appendChild(div)
            for(const child of event.children) {
                renderEvent(child)
            }
        }

        // Render all of the events that were loaded from the log file
        for(const event of events) {
            renderEvent(event)
        }
        
        /** 
         * A function to be called whenever the window is resized
         */
        function renderOnResize() {
            document.querySelector("#spacetime").innerHTML = ""

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

        // This adds the previously defined function as an event listener for 
        // the window resize event
        window.addEventListener("resize", renderOnResize)

        // This event listener finishes the resizing of the time axis when the 
        // mouse is unclicked. Needs to be async to call renderOnResize()
        document.body.addEventListener("mouseup", e => {
            if(resizing) {
                resizing = false;
                const ctx = overlayCanvas.getContext("2d")
                ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
                drawLine(ctx, e.clientX, 0, e.clientX, overlayCanvas.height, 2)

                let click = (mouseStart / window.innerWidth) * (pageEnd - pageStart) + pageStart
                let unclick = (e.clientX / window.innerWidth) * (pageEnd - pageStart) + pageStart

                console.log("Click: " + mouseStart + " Unclick: " + e.clientX)
                if(Math.abs(mouseStart - e.clientX) > 20) {
                    pageStart = e.clientX > mouseStart ? click : unclick
                    pageEnd = e.clientX > mouseStart ? unclick : click
                    renderOnResize()
                }
            }
        })
    })() // End of async zone!
    
    // Whenever the add series button is clicked, the series that is currently
    // selected under the series selector drop down is then added to our list
    // of currently plotted series and then the graphs are refreshed.
    document.querySelector("#addSeriesButton").addEventListener("click", e => {
        e.stopPropagation()
        const canvas = document.createElement("canvas")
        canvas.setAttribute("width", document.body.clientWidth)
        canvas.setAttribute("height", 200)

        seriesToPlot.push({
            name: document.querySelector("#seriesSelector").value,
            canvas: canvas,
        })
        refresh()
    })
    
    // Renders the horizontal axis at the top of the screen
    renderTopBar()

    // This section sets the width and height of the overlay canvas to be the 
    // full screen width and height
    const overlayCanvas = document.querySelector("#overlayCanvas")
    overlayCanvas.setAttribute("width", window.innerWidth)
    overlayCanvas.setAttribute("height", window.innerHeight)

    // Adds an overlay redraw action to the event listener for mouse movement
    document.body.addEventListener("mousemove", e => {
        const ctx = overlayCanvas.getContext("2d")
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
        if(!resizing) {
            drawLine(ctx, e.clientX, 0, e.clientX, overlayCanvas.height, 2)
        } else {
            ctx.fillStyle = "#000"
            ctx.fillRect(mouseStart, 0, e.clientX - mouseStart, overlayCanvas.height)
        }
    })

    // Starts the resizing process of the time axis when the mouse is clicked
    document.body.addEventListener("mousedown", e => {
        resizing = true
        mouseStart = e.clientX
    })

    // Stops the mouse up and down events from activating on the series selector
    document.querySelector("#seriesSelector").addEventListener("mouseup", e => {
        e.stopPropagation()
    })

    document.querySelector("#seriesSelector").addEventListener("mousedown", e => {
        e.stopPropagation()
    })

    // Makes the body fullscreen so that the mouse event listeners activate
    // everywhere on the page
    document.body.style.position = "absolute"
    document.body.style.top = "0"
    document.body.style.bottom = "0"
    document.body.style.left = "0"
    document.body.style.right = "0"
})

/**
 * This function should be called whenever the state is updated.
 * Add stuff in here when new state or state-modification methods are created
 */
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

/**
 * Loads the log messages from a specific log file. This also populates
 * the dataSeries variable with a bunch of names of data series.
 * @param {Number} match the number match to load
 * @returns a list of log messages in JSON
 */
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

/**
 * Parses a list of log messages and returns formatted spacetime events
 * @param {*} logs the log messages (in JSON form) to parse
 * @returns formatted spacetime events
 */
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

/**
 * Takes a list of spacetime events and sorts them into tracks
 * depending on whether or not they overlap
 * @param {*} spacetimeEvents 
 */
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

/**
 * A function used when getting the height of certain spacetime events
 * @param {*} events the events to get the combined height of
 * @param {*} levels the levels those events are on
 * @param {*} currentLevel the current level being worked on
 * @returns the combined height of all of those events
 */
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

/** 
 * Gets the height of just one event and recurses back into the getHeightOfEvents
*/
function getHeightOfEvent(event, levels, currentLevel) {
    levels[event.id] = currentLevel
    return 1 + getHeightOfEvents(event.children, levels, currentLevel + 1)
}

/**
 * A wrapper function that gets the levels that each spacetime event is located
 * @param {*} events a list of spacetime events that are being analyzed
 * @returns a list of levels that will contain the level of each spacetime event
 */
function getLevels(events) {
    const levels = {}
    getHeightOfEvents(events, levels, 0)
    return levels
}

/**
 * Extracts the data from log files
 * @param {*} logs the log files to parse from
 * @returns a list of data series each containing points
 */
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

/**
 * Allows a data series to be graphed on a certain canvas
 * @param {*} dataSeries the series to plot
 * @param {*} canvas the canvas to plot on
 */
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

/**
 * Tells you whether two spacetime events overlap or not
 * @param {*} event1 
 * @param {*} event2 
 */
function doEventsOverlap(event1, event2) {
    return event1.startTime < event2.endTime && event1.endTime > event2.startTime
}

/**
 * Renders the horizontal axis at the top of the screen
 */
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

/**
 * Draws a circle on a canvas
 * @param {*} context the context of the canvas to draw on
 * @param {Number} x the x-coordinate of the center
 * @param {Number} y the y-coordinate of the center
 * @param {Number} radius the radius of the circle
 * @param {String} color the fill color of the circle
 */
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

/**
 * Draws a line on a canvas
 * @param {*} context the context of the canvas to draw on
 * @param {Number} x1 the x-coordinate of the starting point
 * @param {Number} y1 the y-coordinate of the starting point
 * @param {Number} x2 the x-coordinate of the ending point
 * @param {Number} y2 the y-coordinate of the ending point
 * @param {Number} thickness how thick to make the line (pixels)
 * @param {String} color the color of the line
 */
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

/**
 * Draws some text on a canvas
 * @param {*} context the context of the canvas to draw on
 * @param {String} text the text to draw
 * @param {*} origin the origin point of the text being drawn
 * @param {String} color the color of the text
 * @param {Number} size the font size
 * @param {String} font the font family
 */
function drawText(context, text, origin, color = 'black', size = 14, font = 'Arial') {
    context.font = size + 'px ' + font;
    context.fillStyle = color;
    context.fillText(
        text,
        origin.x,
        origin.y
    );
}
