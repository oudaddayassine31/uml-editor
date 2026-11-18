
  const STEREOS = ["FeatureType", "DataType", "Union", "CodeList", "Enumeration", "Type"];
  const ST_ABBR = { F: "FeatureType", D: "DataType", C: "CodeList", E: "Enumeration", U: "Union" };

  const PRIMITIVES = [
    "CharacterString", "Integer", "Real", "Boolean", "Date", "DateTime", "Decimal", "Number", "URI", "ID",
    "Code", "ScopedName", "GenericName", "Measure", "Length", "Area", "Volume", "Angle", "Velocity", "Scale",
    "MeasureOrNilReasonList", "DoubleList", "DoubleBetween0and1", "IntegerBetween0and3", "TM_Position", "TM_Period",
    "GM_Object", "GM_Point", "GM_Curve", "GM_Surface", "GM_Solid", "GM_MultiPoint", "GM_MultiCurve",
    "GM_MultiSurface", "GM_MultiSolid", "GM_Primitive"
  ];

  const MODULES = {
    core: "Core", con: "Construction", bldg: "Building", veg: "Vegetation", luse: "LandUse", wtr: "WaterBody",
    gen: "Generics", grp: "CityObjectGroup", frn: "CityFurniture", tran: "Transportation", dem: "Relief"
  };

  const CUF = (p) => `class:${p}ClassValue[0..1];function:${p}FunctionValue[0..*];usage:${p}UsageValue[0..*]`;

  // [module, name, stereotype, abstract, superclass, attrs]  (subset, simplified, of CityGML 3.0 CM)
  const LIB_SRC = [
    ["core", "AbstractFeature", "F", 1, null, "featureID:ID[1];identifier:ScopedName[0..1];name:GenericName[0..*];description:CharacterString[0..1]"],
    ["core", "AbstractFeatureWithLifespan", "F", 1, "AbstractFeature", "creationDate:DateTime[0..1];terminationDate:DateTime[0..1];validFrom:DateTime[0..1];validTo:DateTime[0..1]"],
    ["core", "AbstractCityObject", "F", 1, "AbstractFeatureWithLifespan", "relativeToTerrain:RelativeToTerrain[0..1];relativeToWater:RelativeToWater[0..1];externalReference:ExternalReference[0..*]"],
    ["core", "AbstractSpace", "F", 1, "AbstractCityObject", "spaceType:SpaceType[0..1];volume:QualifiedVolume[0..*];area:QualifiedArea[0..*]"],
    ["core", "AbstractPhysicalSpace", "F", 1, "AbstractSpace", ""],
    ["core", "AbstractOccupiedSpace", "F", 1, "AbstractPhysicalSpace", ""],
    ["core", "AbstractUnoccupiedSpace", "F", 1, "AbstractPhysicalSpace", ""],
    ["core", "AbstractLogicalSpace", "F", 1, "AbstractSpace", ""],
    ["core", "AbstractSpaceBoundary", "F", 1, "AbstractCityObject", ""],
    ["core", "AbstractThematicSurface", "F", 1, "AbstractSpaceBoundary", "area:QualifiedArea[0..*]"],
    ["core", "ClosureSurface", "F", 0, "AbstractThematicSurface", ""],
    ["core", "Address", "F", 0, "AbstractFeature", ""],
    ["core", "CityModel", "F", 0, "AbstractFeatureWithLifespan", ""],
    ["core", "AbstractPointCloud", "F", 1, "AbstractFeature", ""],
    ["core", "ExternalReference", "D", 0, null, "targetResource:URI[1];informationSystem:URI[0..1];relationType:URI[0..1]"],
    ["core", "QualifiedArea", "D", 0, null, "area:Area[1];typeOfArea:QualifiedAreaTypeValue[1]"],
    ["core", "QualifiedVolume", "D", 0, null, "volume:Volume[1];typeOfVolume:QualifiedVolumeTypeValue[1]"],
    ["core", "Occupancy", "D", 0, null, "numberOfOccupants:Integer[1];interval:IntervalValue[0..1];occupantType:OccupantTypeValue[0..1]"],
    ["core", "RelativeToTerrain", "E", 0, null, "entirelyAboveTerrain;substantiallyAboveTerrain;substantiallyAboveAndBelowTerrain;substantiallyBelowTerrain;entirelyBelowTerrain"],
    ["core", "RelativeToWater", "E", 0, null, "entirelyAboveWaterSurface;substantiallyAboveWaterSurface;substantiallyAboveAndBelowWaterSurface;substantiallyBelowWaterSurface;entirelyBelowWaterSurface;temporarilyAboveAndBelowWaterSurface"],
    ["core", "SpaceType", "E", 0, null, "closed;open;semiOpen"],

    ["con", "AbstractConstruction", "F", 1, "AbstractOccupiedSpace", "conditionOfConstruction:ConditionOfConstructionValue[0..1];dateOfConstruction:Date[0..1];dateOfRenovation:Date[0..1];dateOfDemolition:Date[0..1];elevation:Elevation[0..*];height:Height[0..*];occupancy:Occupancy[0..*]"],
    ["con", "AbstractConstructiveElement", "F", 1, "AbstractOccupiedSpace", "isStructuralElement:Boolean[0..1]"],
    ["con", "AbstractInstallation", "F", 1, "AbstractOccupiedSpace", "relationToConstruction:RelationToConstruction[0..1]"],
    ["con", "AbstractFurniture", "F", 1, "AbstractOccupiedSpace", ""],
    ["con", "AbstractFillingElement", "F", 1, "AbstractOccupiedSpace", ""],
    ["con", "Door", "F", 0, "AbstractFillingElement", ""],
    ["con", "Window", "F", 0, "AbstractFillingElement", ""],
    ["con", "AbstractConstructionSurface", "F", 1, "AbstractThematicSurface", ""],
    ["con", "RoofSurface", "F", 0, "AbstractConstructionSurface", ""],
    ["con", "WallSurface", "F", 0, "AbstractConstructionSurface", ""],
    ["con", "GroundSurface", "F", 0, "AbstractConstructionSurface", ""],
    ["con", "OuterCeilingSurface", "F", 0, "AbstractConstructionSurface", ""],
    ["con", "OuterFloorSurface", "F", 0, "AbstractConstructionSurface", ""],
    ["con", "CeilingSurface", "F", 0, "AbstractConstructionSurface", ""],
    ["con", "FloorSurface", "F", 0, "AbstractConstructionSurface", ""],
    ["con", "InteriorWallSurface", "F", 0, "AbstractConstructionSurface", ""],
    ["con", "AbstractFillingSurface", "F", 1, "AbstractThematicSurface", ""],
    ["con", "DoorSurface", "F", 0, "AbstractFillingSurface", ""],
    ["con", "WindowSurface", "F", 0, "AbstractFillingSurface", ""],
    ["con", "OtherConstruction", "F", 0, "AbstractConstruction", CUF("OtherConstruction")],
    ["con", "Height", "D", 0, null, ""],
    ["con", "Elevation", "D", 0, null, ""],
    ["con", "ConditionOfConstructionValue", "E", 0, null, "declined;demolished;functional;projected;ruin;underConstruction"],
    ["con", "RelationToConstruction", "E", 0, null, "inside;outside;bothInsideAndOutside"],

    ["bldg", "AbstractBuilding", "F", 1, "AbstractConstruction", "class:BuildingClassValue[0..1];function:BuildingFunctionValue[0..*];usage:BuildingUsageValue[0..*];roofType:RoofTypeValue[0..1];storeysAboveGround:Integer[0..1];storeysBelowGround:Integer[0..1];storeyHeightsAboveGround:MeasureOrNilReasonList[0..1];storeyHeightsBelowGround:MeasureOrNilReasonList[0..1]"],
    ["bldg", "Building", "F", 0, "AbstractBuilding", ""],
    ["bldg", "BuildingPart", "F", 0, "AbstractBuilding", ""],
    ["bldg", "BuildingConstructiveElement", "F", 0, "AbstractConstructiveElement", CUF("BuildingConstructiveElement")],
    ["bldg", "BuildingInstallation", "F", 0, "AbstractInstallation", CUF("BuildingInstallation")],
    ["bldg", "BuildingFurniture", "F", 0, "AbstractFurniture", CUF("BuildingFurniture")],
    ["bldg", "BuildingRoom", "F", 0, "AbstractUnoccupiedSpace", CUF("BuildingRoom")],
    ["bldg", "AbstractBuildingSubdivision", "F", 1, "AbstractLogicalSpace", ""],
    ["bldg", "Storey", "F", 0, "AbstractBuildingSubdivision", ""],
    ["bldg", "BuildingUnit", "F", 0, "AbstractBuildingSubdivision", ""],

    ["veg", "AbstractVegetationObject", "F", 1, "AbstractOccupiedSpace", ""],
    ["veg", "SolitaryVegetationObject", "F", 0, "AbstractVegetationObject", CUF("SolitaryVegetationObject") + ";species:SpeciesValue[0..1];height:Length[0..1];trunkDiameter:Length[0..1];crownDiameter:Length[0..1];rootBallDiameter:Length[0..1];maxRootBallDepth:Length[0..1]"],
    ["veg", "PlantCover", "F", 0, "AbstractVegetationObject", CUF("PlantCover") + ";averageHeight:Length[0..1];minHeight:Length[0..1];maxHeight:Length[0..1];minRootBallDepth:Length[0..1];maxRootBallDepth:Length[0..1]"],

    ["luse", "LandUse", "F", 0, "AbstractThematicSurface", CUF("LandUse")],

    ["wtr", "WaterBody", "F", 0, "AbstractOccupiedSpace", CUF("WaterBody")],
    ["wtr", "AbstractWaterBoundarySurface", "F", 1, "AbstractThematicSurface", ""],
    ["wtr", "WaterSurface", "F", 0, "AbstractWaterBoundarySurface", "waterLevel:WaterLevelValue[0..1]"],
    ["wtr", "WaterGroundSurface", "F", 0, "AbstractWaterBoundarySurface", ""],

    ["gen", "GenericOccupiedSpace", "F", 0, "AbstractOccupiedSpace", CUF("GenericOccupiedSpace")],
    ["gen", "GenericUnoccupiedSpace", "F", 0, "AbstractUnoccupiedSpace", CUF("GenericUnoccupiedSpace")],
    ["gen", "GenericLogicalSpace", "F", 0, "AbstractLogicalSpace", CUF("GenericLogicalSpace")],
    ["gen", "GenericThematicSurface", "F", 0, "AbstractThematicSurface", CUF("GenericThematicSurface")],

    ["grp", "CityObjectGroup", "F", 0, "AbstractLogicalSpace", CUF("CityObjectGroup")],
    ["frn", "CityFurniture", "F", 0, "AbstractOccupiedSpace", CUF("CityFurniture")],

    ["tran", "AbstractTransportationSpace", "F", 1, "AbstractUnoccupiedSpace", "trafficDirection:TrafficDirectionValue[0..1]"],
    ["tran", "Road", "F", 0, "AbstractTransportationSpace", CUF("Road")],
    ["tran", "Railway", "F", 0, "AbstractTransportationSpace", CUF("Railway")],
    ["tran", "Track", "F", 0, "AbstractTransportationSpace", CUF("Track")],
    ["tran", "Square", "F", 0, "AbstractTransportationSpace", CUF("Square")],
    ["tran", "Waterway", "F", 0, "AbstractTransportationSpace", CUF("Waterway")],
    ["tran", "TrafficSpace", "F", 0, "AbstractUnoccupiedSpace", ""],
    ["tran", "AuxiliaryTrafficSpace", "F", 0, "AbstractUnoccupiedSpace", ""],
    ["tran", "TrafficArea", "F", 0, "AbstractThematicSurface", CUF("TrafficArea")],
    ["tran", "AuxiliaryTrafficArea", "F", 0, "AbstractThematicSurface", CUF("AuxiliaryTrafficArea")],
    ["tran", "Marking", "F", 0, "AbstractThematicSurface", ""],
    ["tran", "TrafficDirectionValue", "E", 0, null, "forwards;backwards;both"],

    ["dem", "ReliefFeature", "F", 0, "AbstractSpaceBoundary", "lod:IntegerBetween0and3[1]"],
    ["dem", "AbstractReliefComponent", "F", 1, "AbstractSpaceBoundary", "lod:IntegerBetween0and3[1]"],
    ["dem", "TINRelief", "F", 0, "AbstractReliefComponent", ""],
    ["dem", "RasterRelief", "F", 0, "AbstractReliefComponent", ""],
    ["dem", "MassPointRelief", "F", 0, "AbstractReliefComponent", ""],
    ["dem", "BreaklineRelief", "F", 0, "AbstractReliefComponent", ""]
  ];

  // CityGML class -> CityJSON 2.0 city object types / semantic surfaces
  const CJ_OBJECTS = {
    Building: ["Building"], BuildingPart: ["BuildingPart"], BuildingInstallation: ["BuildingInstallation"],
    BuildingConstructiveElement: ["BuildingConstructiveElement"], BuildingFurniture: ["BuildingFurniture"],
    BuildingRoom: ["BuildingRoom"], Storey: ["BuildingStorey"], BuildingUnit: ["BuildingUnit"],
    SolitaryVegetationObject: ["SolitaryVegetationObject"], PlantCover: ["PlantCover"], LandUse: ["LandUse"],
    WaterBody: ["WaterBody"], CityFurniture: ["CityFurniture"], CityObjectGroup: ["CityObjectGroup"],
    GenericOccupiedSpace: ["GenericCityObject"], GenericUnoccupiedSpace: ["GenericCityObject"], GenericLogicalSpace: ["GenericCityObject"],
    Road: ["Road"], Railway: ["Railway"], Waterway: ["Waterway"], TINRelief: ["TINRelief"], OtherConstruction: ["OtherConstruction"]
  };
  const CJ_SURFACES = {
    RoofSurface: "RoofSurface", WallSurface: "WallSurface", GroundSurface: "GroundSurface", ClosureSurface: "ClosureSurface",
    OuterCeilingSurface: "OuterCeilingSurface", OuterFloorSurface: "OuterFloorSurface", CeilingSurface: "CeilingSurface",
    FloorSurface: "FloorSurface", InteriorWallSurface: "InteriorWallSurface", WindowSurface: "Window", DoorSurface: "Door",
    WaterSurface: "WaterSurface", WaterGroundSurface: "WaterGroundSurface", TrafficArea: "TrafficArea", AuxiliaryTrafficArea: "AuxiliaryTrafficArea"
  };

  /* ---------- helpers ---------- */
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const RX_CLASS = /^[A-Z][A-Za-z0-9_]*$/;
  const RX_ATTR = /^[a-z][A-Za-z0-9_]*$/;
  const RX_MULT = /^(\d+|\*)(\.\.(\d+|\*))?$/;

  function parseAttrs(src) {
    if (!src) return [];
    return src.split(";").filter(Boolean).map((s) => {
      const m = s.match(/^([^:\[]+)(?::([^\[]+))?(?:\[([^\]]+)\])?$/);
      if (!m) return { name: s, type: "", mult: "" };
      return { name: m[1].trim(), type: (m[2] || "").trim(), mult: (m[3] || "").trim() };
    });
  }

  const LIB = {};
  for (const [mod, name, st, abs, sup, attrs] of LIB_SRC) {
    LIB[name] = { name, module: mod, stereotype: ST_ABBR[st], abstract: !!abs, superclass: sup, attributes: parseAttrs(attrs), ref: true };
  }
  // ADE hooks: one abstract «DataType» ADEOf<X> per FeatureType
  for (const c of Object.values(LIB)) {
    if (c.stereotype === "FeatureType") {
      const h = "ADEOf" + c.name;
      LIB[h] = { name: h, module: c.module, stereotype: "DataType", abstract: true, superclass: null, attributes: [], ref: true, hookOf: c.name };
    }
  }
  // CodeLists referenced by library attributes (values are defined outside the model)
  for (const c of Object.values(LIB).slice()) {
    for (const a of c.attributes) {
      if (a.type && /Value$/.test(a.type) && !LIB[a.type] && !PRIMITIVES.includes(a.type)) {
        LIB[a.type] = { name: a.type, module: c.module, stereotype: "CodeList", abstract: false, superclass: null, attributes: [], ref: true };
      }
    }
  }

