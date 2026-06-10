//1. Define Area of Interet (AOI) near Indus River, Sindh, Pakistan
var roi = ee.Geometry.Point([68.05, 26.24]).buffer(6000);
Map.centerObject(roi, 9);
Map.setOptions('SATELLITE');

//2. Define Timeframes
var prePeriod={start: '2022-05-01', end:'2022-05-31'}; //Dry
var postPeriod= {start: '2022-08-25', end:'2022-09-15'}; //Peak

//3. Load and filter Sentinel-1 GRD Image Collection 
var s1Collection = ee.ImageCollection('COPERNICUS/S1_GRD')
.filterBounds(roi)
.filter(ee.Filter.eq('instrumentMode', 'IW'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
.filter(ee.Filter.eq('orbitProperties_pass','DESCENDING'));

//Create a median composite for pre- and post-flood periods and clip to ROI
var preFlood = s1Collection.filterDate(prePeriod.start, prePeriod.end).median().clip(roi);
var postFlood = s1Collection.filterDate(postPeriod.start, postPeriod.end).median().clip(roi);

//4. Speckle Filtering (Smoothing)
var SMOOTHING_RADIUS = 30;
var preFloodFiltered = preFlood.focal_mean(SMOOTHING_RADIUS, 'circle', 'meters');
var postFloodFiltered = postFlood.focal_mean(SMOOTHING_RADIUS, 'circle', 'meters');

//5. Calculate Difference and Apply Thresholds 
var difference = postFloodFiltered.subtract(preFloodFiltered);

//Classify a pixel as "Flooded" if it is dark post-flood AND significantly darker than before 
var floodThreshold = -18;
var diffThreshold = -3;

var floodedAreas = postFloodFiltered.lt(floodThreshold).and(difference.lt(diffThreshold));

//6. Mask Permanent Water Bodies using Global Surface Water dataset 
var permanentWater = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('seasonality').gte(10); // Pixels wet 10-12 months a year 
 
// Keep only newly flooded pixels (Flooded areas AND NOT permanent water)
var finalFloodMask = floodedAreas.select('VH').where(permanentWater, 0).selfMask();
  
// 7. Calculate Total Flooded Area in Hectares
var areaImage = finalFloodMask.multiply(ee.Image.pixelArea());

var areaStats = areaImage.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: roi,
  scale: 10, // Sentinel-1 pixel resolution
  maxPixels: 1e10
});

var floodedHectares = ee.Number(areaStats.get('VH')).divide(10000);

print('Estimated Flooded Area (Hectares):', floodedHectares);

// 8. Visualization Setup
Map.addLayer(
  preFloodFiltered,
  {min: -25, max: 0},
  'Pre-Flood SAR (May)',
  false
);

Map.addLayer(
  postFloodFiltered,
  {min: -25, max: 0},
  'Post-Flood SAR (Aug/Sep)',
  false
);

Map.addLayer(
  finalFloodMask,
  {palette: ['#0000FF']},
  'Inundated Flood Extent'
);
