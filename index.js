const api_key = "YOUR_API_KEY";
 
var map;
var waypointsLayer = L.featureGroup();
var routesLayer = L.geoJSON();;
var blockIntersectionRoadsLayer = L.featureGroup();

var summaryControl;

var routeResults = { 'stdRoute': {}, 'birRoute': {} };

var curIntersectingPolylineLayer = null;
var curIntersectingMarkerLayer = null;
var curIntersectingMouselineLayer = L.featureGroup();

var editionMode = false;
var routeCalculationInProgress = false;

function onMapClick(e) {
    if (routeCalculationInProgress)
        return;
        
    if (editionMode) {
        curIntersectingPolylineLayer.addLatLng(e.latlng);
        const marker = L.circleMarker(e.latlng, {color: '#AA0000'}).addTo(curIntersectingMarkerLayer);
    } else {
        if (waypointsLayer.getLayers().length == 5) {
            alert('The maximum number of waypoints is reached');
        } else {
            const marker = L.marker(e.latlng).addTo(waypointsLayer);
            marker.on('contextmenu', removeWaypoint);
            calculateRoute();
        }
    }
}

function onMouseMove(e) {
    if (!editionMode) return;
    let points = curIntersectingPolylineLayer.getLatLngs();
    curIntersectingMouselineLayer.clearLayers();
    const marker = L.circleMarker(e.latlng, {color: '#FF7F7F'}).addTo(curIntersectingMouselineLayer);
    if (points.length > 0) {
        const line = L.polyline([points[points.length - 1], e.latlng], {color: '#FF7F7F', dashArray: '20, 20', dashOffset: '0'}).addTo(curIntersectingMouselineLayer);
    }
}

function OnMapContextMenu(e) {
    if (routeCalculationInProgress)
        return;
        
    if (editionMode) {
        let fireCalculateRoute = false;
        // finalize polyline
        let points = curIntersectingPolylineLayer.getLatLngs();
        if (points.length > 1) {
            const newPolyline = L.polyline(points, {color: '#AA0000'}).addTo(blockIntersectionRoadsLayer);
            fireCalculateRoute = true;
        }        
        curIntersectingMouselineLayer.clearLayers();
        curIntersectingPolylineLayer.remove();
        curIntersectingMarkerLayer.remove();
        editionMode = false;
        document.getElementById('blockIntersectionPolylineCount').innerText = blockIntersectionRoadsLayer.getLayers().length;
        document.getElementById('btn-delete-polylines').disabled = false;
        document.getElementById('btn-add-polyline').disabled = (blockIntersectionRoadsLayer.getLayers().length >= 10); // impossible to create more than 10 !
        switchDescriptionBannerText();
        if (fireCalculateRoute) {
            calculateRoute();
        }
    }
}

function removeWaypoint(e) {
    if (routeCalculationInProgress)
        return;
        
    waypointsLayer.eachLayer((layer) => {
        if (layer instanceof L.Marker && layer._latlng === e.latlng) {
            waypointsLayer.removeLayer(layer);
        }
    });
    calculateRoute();
}

async function calculateRoute() {
    if (routeCalculationInProgress)
        return;
        
    document.getElementById('map').style.cursor = 'wait';
    
    routeCalculationInProgress = true;
    
    const waypoints = [];
    waypointsLayer.eachLayer((layer) => {
        if (layer instanceof L.Marker) {
            waypoints.push(layer._latlng);
        }
    });
    if (waypoints.length > 1) {
        clearPolyline();
        
        // normal route
        await fetch(
            "https://api.myptv.com/routing/v1/routes" + getQuery(waypoints, false),
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'apiKey': api_key
              }
            }
        )
        .then((response) => response.json()
            .then((result) => {
                addPolyline(JSON.parse(result.polyline), false);
                addToResult(result, false);
            })
        );
        
        // route considering the blockings
        await fetch(
            "https://api.myptv.com/routing/v1/routes" + getQuery(waypoints, true),
            {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'apiKey': api_key
              }
            }
        )
        .then((response) => response.json()
            .then((result) => {
                addPolyline(JSON.parse(result.polyline), true);
                addToResult(result, true);
            })
        );

        // finally display the results
        displayResults();
        map.fitBounds(routesLayer.getBounds(), {padding: [50, 50]});
    } else {
        clearResults();
    }
    document.getElementById('map').style.cursor = '';
    routeCalculationInProgress = false;
}

function getQuery(waypoints, addBlockIntersectingRoads) {
    let query = '?results=POLYLINE';
    waypoints.forEach((waypoint) => {
        query += '&waypoints=' + waypoint.lat + ',' + waypoint.lng;
    });
    if (addBlockIntersectingRoads) {
        queryOption = '';
        blockIntersectionRoadsLayer.eachLayer((layer) => {
            if (layer instanceof L.Polyline) {
                let line = '';
                layer.getLatLngs().forEach((latlng) => {
                    line += latlng.lat + ',' + latlng.lng + ',';
                });
                queryOption += line.slice(0, -1) + '|';
            }
        });
        if (queryOption.length > 1) {
            query += '&options[blockIntersectingRoads]=' + queryOption.slice(0,-1);
        }
    }
    return query;
}

function clearPolyline() {
    routesLayer.clearLayers();
}

function clearResults() {
    summaryControl.remove();
    clearPolyline();
}

function addPolyline(polyline, addBlockIntersectingRoads) {
  const myStyle = {
    'color': addBlockIntersectingRoads ? '#FF6A00': '#2882C8',
    'weight': addBlockIntersectingRoads ? 8 : 5,
    'opacity': addBlockIntersectingRoads? 0.85 : 0.65
  };
  const polylineLayer = L.geoJSON(polyline, { style: myStyle }).addTo(routesLayer);
  if (addBlockIntersectingRoads) {
      polylineLayer.bringToBack();
  }
}

function addToResult(result, addBlockIntersectingRoads) {
    if (addBlockIntersectingRoads) {
        routeResults.birRoute = { 'distance': convertDistance(result.distance), 'traveltime': convertTime(result.travelTime), 'violated': result.violated };
    } else {
        routeResults.stdRoute = { 'distance': convertDistance(result.distance), 'traveltime': convertTime(result.travelTime), 'violated': result.violated };
    }
}

function displayResults() {
    summaryControl.addTo(map);
    document.getElementById('stdRoute-distance').innerText = routeResults.stdRoute.distance;
    document.getElementById('stdRoute-traveltime').innerText = routeResults.stdRoute.traveltime;
    document.getElementById('stdRoute-violated').innerText = routeResults.stdRoute.violated;
    document.getElementById('birRoute-distance').innerText = routeResults.birRoute.distance;
    document.getElementById('birRoute-traveltime').innerText = routeResults.birRoute.traveltime;
    document.getElementById('birRoute-violated').innerText = routeResults.birRoute.violated;
}

function resetAllIntersectingPolylines() {
    if (routeCalculationInProgress)
        return;
        
    blockIntersectionRoadsLayer.clearLayers();
    document.getElementById('blockIntersectionPolylineCount').innerText = blockIntersectionRoadsLayer.getLayers().length;
    document.getElementById('btn-add-polyline').disabled = false;
    calculateRoute();
}

function addIntersectingPolyline() {
    if (routeCalculationInProgress)
        return;
        
    editionMode = true;
    document.getElementById('btn-add-polyline').disabled = true;
    document.getElementById('btn-delete-polylines').disabled = true;
    switchDescriptionBannerText();
    
    curIntersectingPolylineLayer = L.polyline([], {color: 'red'});
    curIntersectingPolylineLayer.addTo(map);
    curIntersectingMarkerLayer = L.featureGroup();
    curIntersectingMarkerLayer.addTo(map);
}

// UI controls
function addRoutingControl() {
  const routingControl = L.control({position: 'topleft'});
  routingControl.onAdd = function(map) {
    const div = L.DomUtil.create('div', 'routing-control');
    const html = `
        <h2>Intersecting polylines</h2>
        <span id="blockIntersectionPolylineCount">0</span><span> polyline(s) have been created. (max. 10)</span>
        <div class="group space-between">
            <button type="button" id="btn-add-polyline">Add polyline</button>
            <button type="button" id="btn-delete-polylines">Delete all polylines</button>
        </div>
`;
    div.innerHTML = html;

    L.DomEvent.disableScrollPropagation(div);
    L.DomEvent.disableClickPropagation(div);

    return div;
  };
  routingControl.addTo(map);
  
  document.getElementById('btn-add-polyline').addEventListener("click", addIntersectingPolyline);
  document.getElementById('btn-delete-polylines').addEventListener("click", resetAllIntersectingPolylines);
}

function switchDescriptionBannerText() {
    if (editionMode) {
        document.getElementById('bannerDescriptionText').innerText =
        `Left click to add a point to the intersecting polyline.
        Right click to validate the polyline and exit the edition mode.`;
    } else {
        document.getElementById('bannerDescriptionText').innerText =
        `Left click to add a waypoint and right click to remove one. (max. 5)
        The waypoint order is determined by the order of their creation.`;
    }
}

function addDescriptionBanner() {
    const banner = L.control({position: 'bottomleft'});
    banner.onAdd = function(map) {
        const div = L.DomUtil.create('div', 'banner');
        const html = `<p><span class="" id="bannerDescriptionText"/>-</span></p>`;
        div.innerHTML = html;

        L.DomEvent.disableScrollPropagation(div);
        L.DomEvent.disableClickPropagation(div);

        return div;
    };
    banner.addTo(map);
    switchDescriptionBannerText(false);
}

function addSummaryControl() {
    summaryControl = L.control({position: 'topright'});
    summaryControl.onAdd = function(map) {
        const div = L.DomUtil.create('div', 'summary-control');
        const html = `
            <h2>Summary</h2>
            <div id="summaryTableWrapper">
                <h3>Standard route</h3>
                <div class="key-value"><span>Distance: </span><span id="stdRoute-distance">-</span></div>
                <div class="key-value"><span>Travel time: </span><span id="stdRoute-traveltime">-</span></div>
                <div class="key-value"><span>Route violated: </span><span id="stdRoute-violated">-</span></div>
                <h3>Route with blocked roads</h3>
                <div class="key-value"><span>Distance: </span><span id="birRoute-distance">-</span></div>
                <div class="key-value"><span>Travel time: </span><span id="birRoute-traveltime">-</span></div>
                <div class="key-value"><span>Route violated: </span><span id="birRoute-violated">-</span></div>
            </div>
        `;
        div.innerHTML = html;

        L.DomEvent.disableScrollPropagation(div);
        L.DomEvent.disableClickPropagation(div);

        return div;
    };
}

$(document).ready(function() {
    map = new L.Map('map', {
        center: L.latLng(49, 8.4),
        zoom: 13,
        zoomControl: false
    });

    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);

    const tileLayer = new L.tileLayer(
        "https://api.myptv.com/rastermaps/v1/image-tiles/{z}/{x}/{y}?size={tileSize}",
        {
          attribution: '© ' + new Date().getFullYear() + ', PTV Group, HERE',
          tileSize: 256,
          trackResize: false
        },
        [
          {header: 'ApiKey', value: api_key}
        ]).addTo(map);
    map.on('click', onMapClick);
    map.on('contextmenu', OnMapContextMenu);
    map.on('mousemove', onMouseMove);
  
    waypointsLayer.addTo(map);
    routesLayer.addTo(map);
    blockIntersectionRoadsLayer.addTo(map);
  
    curIntersectingMouselineLayer.addTo(map);
     
    addRoutingControl();
    addDescriptionBanner();
    addSummaryControl();
});
  