const C = require('../dist/core.cjs');
const fs = require('fs'), assert = require('assert');
let n = 0; const ok = (name, f) => { try { f(); n++; console.log('ok  ', name); } catch (e) { console.log('FAIL', name, '\n   ', e.message); process.exitCode = 1; } };
const shape = (m) => JSON.stringify({ c: m.classes.map(c => [c.name, c.stereotype, !!c.external, !!c.abstract, c.attributes, c.operations]), r: m.relations.map(r => [r.kind, r.from, r.to, r.name, r.fromMult, r.toMult, r.fromRole, r.toRole, r.nav]).sort(), n: m.notes.map(x => [x.text, x.near]) });

ok('ops: classes, members, relations', () => {
  const st = C.emptyState('M');
  const r = C.applyOps(st, [
    { op: 'add_class', name: 'Shape', abstract: true, attributes: ['+name : String', '-id : int = 0'], operations: ['+area() : double', '{abstract} draw(g: Graphics)'] },
    { op: 'add_class', name: 'Drawable', stereotype: 'interface' },
    { op: 'add_class', name: 'Circle', superclass: 'Shape', realizes: ['Drawable'], attributes: [{ name: 'radius', type: 'double' }] },
    { op: 'add_class', name: 'Color', stereotype: 'enum', attributes: ['RED', 'GREEN'] },
    { op: 'add_association', from: 'Circle', to: 'Color', role: 'fill', toMult: '1' },
    { op: 'add_relation', kind: 'dependency', from: 'Circle', to: 'Shape' },
    { op: 'add_relation', kind: 'generalization', from: 'Circle', to: 'Circle' },
    { op: 'update_attribute', class: 'Circle', name: 'radius', text: '#radius : float [1] = 1.0' },
    { op: 'add_operation', class: 'Circle', text: '+scale(f: float) : void' },
    { op: 'move_attribute', class: 'Shape', name: 'id', to: 0 },
    { op: 'update_class', name: 'Shape', set: { name: 'AbstractShape' } },
  ]);
  assert.deepStrictEqual(r.failed.map(f => f.index), [6]);
  const m = st.model;
  assert.deepStrictEqual(C.supersOf(m, 'Circle'), ['AbstractShape']);
  assert.strictEqual(m.relations.length, 4);
  const circle = C.findClass(m, 'Circle');
  assert.deepStrictEqual(circle.attributes[0], { name: 'radius', type: 'float', mult: '1', vis: '#', default: '1.0' });
  assert.strictEqual(C.findClass(m, 'AbstractShape').attributes[0].name, 'id');
  assert.strictEqual(C.findClass(m, 'Color').stereotype, 'Enumeration');
  assert.strictEqual(C.validate(m).filter(i => i.level === 'error').length, 0);
  C.applyOps(st, [{ op: 'delete_class', name: 'AbstractShape' }]);
  assert.strictEqual(m.relations.length, 2);
});

ok('P03: import, 0 skipped, round-trip PlantUML and Mermaid', () => {
  const { state, report } = C.fromPlantUML(fs.readFileSync(__dirname + '/p03.puml', 'utf8'));
  assert.strictEqual(report.skipped.length, 0);
  assert.deepStrictEqual([report.classes, report.externals, report.generalizations, report.relations], [9, 3, 1, 7]);
  assert.strictEqual(state.model.profile, 'iso19109');
  assert.strictEqual(state.model.name, '03 Soil and Ground Investigation');
  assert.deepStrictEqual(state.model.externalTypes, ['DepthMeasurement', 'Identifier', 'PropertyValue']);
  assert.strictEqual(C.validate(state.model).filter(i => i.level === 'error').length, 0);
  const again = C.fromPlantUML(C.toPlantUML(state.model));
  assert.strictEqual(shape(again.state.model), shape(state.model));
  const mm = C.fromMermaid(C.toMermaid(state.model));
  assert.strictEqual(mm.report.skipped.length, 0, JSON.stringify(mm.report.skipped));
  assert.strictEqual(mm.state.model.classes.length, 12);
  assert.strictEqual(mm.state.model.relations.length, 8);
});

const MESSY = `
@startuml
skinparam monochrome true
left to right direction
' llm generated
abstract class Vehicle<T> {
  - String vin
  # wheels : int = 4
  + {static} count : int
  + start() : void
  + {abstract} void stop()
  getOwner(): Person
}
class Car extends Vehicle implements Drivable, Serializable {
  +doors: int
}
interface Drivable {
  drive(speed: int, dir: Direction)
}
enum Direction { NORTH, SOUTH }
class "Parking Lot" as PL
PL : capacity : int
PL "1" o-- "0..*" Car : contains >
Car ..> Direction : uses
Car "*" <--> "1 owner" Person
Truck -up-|> Vehicle
Truck -[#red]-> Trailer
note right of Car : fast one
note as N1
  free note
end note
legend
  blah
end legend
Bob -> Alice : hello()
some garbage here !!
@enduml`;
ok('messy PlantUML: methods, extends/implements, generics, aliases, arrows', () => {
  const { state, report } = C.fromPlantUML(MESSY);
  const m = state.model, cls = (n) => C.findClass(m, n);
  assert.strictEqual(m.profile, 'uml');
  assert.ok(cls('Vehicle').abstract);
  assert.deepStrictEqual(cls('Vehicle').attributes.map(a => C.attrText(a)), ['-vin : String', '#wheels : int = 4', '+count : int']);
  assert.ok(cls('Vehicle').attributes[2].static);
  assert.deepStrictEqual(cls('Vehicle').operations.map(C.opText), ['+start()', '+stop()', 'getOwner() : Person']);
  assert.ok(cls('Vehicle').operations[1].abstract);
  assert.deepStrictEqual(C.supersOf(m, 'Car'), ['Vehicle']);
  assert.deepStrictEqual(C.supersOf(m, 'Car', 'realization'), ['Drivable', 'Serializable']);
  assert.strictEqual(cls('Drivable').stereotype, 'Interface');
  assert.deepStrictEqual(cls('Direction').attributes.map(a => a.name), ['NORTH', 'SOUTH']);
  assert.ok(cls('Parking Lot') && cls('Parking Lot').attributes[0].name === 'capacity');
  const rel = (f, t) => m.relations.find(r => r.from === f && r.to === t);
  assert.strictEqual(rel('Parking Lot', 'Car').kind, 'aggregation');
  assert.strictEqual(rel('Parking Lot', 'Car').toMult, '0..*');
  assert.strictEqual(rel('Parking Lot', 'Car').name, 'contains');
  assert.strictEqual(rel('Car', 'Direction').kind, 'dependency');
  assert.strictEqual(rel('Car', 'Person').nav, 'both');
  assert.strictEqual(rel('Car', 'Person').toRole, 'owner');
  assert.strictEqual(rel('Truck', 'Vehicle').kind, 'generalization');
  assert.strictEqual(rel('Truck', 'Trailer').kind, 'association');
  assert.ok(cls('Person').external && cls('Serializable').external);
  assert.strictEqual(m.notes.length, 2);
  assert.strictEqual(m.notes[0].near, 'Car');
  assert.strictEqual(report.skipped.length, 1, JSON.stringify(report.skipped));
  assert.strictEqual(C.validate(m).filter(i => i.level === 'error').length, 0);
  const again = C.fromPlantUML(C.toPlantUML(m));
  assert.strictEqual(again.report.skipped.length, 0, JSON.stringify(again.report.skipped));
  assert.strictEqual(shape(again.state.model), shape(m));
});

const MER = "```mermaid\nclassDiagram\n  direction LR\n  class Animal {\n    <<abstract>>\n    +String name\n    +int age\n    +makeSound() void\n    +isMammal() bool$\n  }\n  class Duck{\n    +String beakColor\n    +swim()\n  }\n  class Flyer\n  <<interface>> Flyer\n  Flyer : +fly(height int) bool\n  class Size {\n    <<enumeration>>\n    SMALL\n    LARGE\n  }\n  Animal <|-- Duck\n  Duck ..|> Flyer\n  Duck \"1\" *-- \"2\" Wing : has\n  Duck --> Size\n  Zoo \"1\" o-- \"many\" Animal\n  class List~T~\n  note for Duck \"can fly\\ncan swim\"\n  %% comment\n```";
ok('Mermaid classDiagram import', () => {
  const { state, report } = C.fromMermaid(MER);
  const m = state.model, cls = (n) => C.findClass(m, n);
  assert.strictEqual(report.skipped.length, 0, JSON.stringify(report.skipped));
  assert.ok(cls('Animal').abstract);
  assert.deepStrictEqual(cls('Animal').attributes.map(a => C.attrText(a)), ['+name : String', '+age : int']);
  assert.deepStrictEqual(cls('Animal').operations.map(C.opText), ['+makeSound()', '+isMammal() : bool']);
  assert.ok(cls('Animal').operations[1].static);
  assert.strictEqual(cls('Flyer').stereotype, 'Interface');
  assert.strictEqual(cls('Flyer').operations[0].params, 'height int');
  assert.deepStrictEqual(cls('Size').attributes, [{ name: 'SMALL', type: '', mult: '' }, { name: 'LARGE', type: '', mult: '' }]);
  assert.deepStrictEqual(C.supersOf(m, 'Duck'), ['Animal']);
  assert.deepStrictEqual(C.supersOf(m, 'Duck', 'realization'), ['Flyer']);
  const rel = (f, t) => m.relations.find(r => r.from === f && r.to === t);
  assert.strictEqual(rel('Duck', 'Wing').kind, 'composition');
  assert.strictEqual(rel('Zoo', 'Animal').toMult, '0..*');
  assert.ok(cls('List'));
  assert.strictEqual(m.notes[0].text, 'can fly\ncan swim');
  assert.strictEqual(C.detectFormat(MER), 'mermaid');
  const again = C.fromMermaid(C.toMermaid(m));
  assert.strictEqual(again.report.skipped.length, 0, JSON.stringify(again.report.skipped));
  assert.strictEqual(shape(again.state.model), shape(m));
});

ok('merge: a second package resolves stubs', () => {
  const a = C.fromPlantUML(fs.readFileSync(__dirname + '/p03.puml', 'utf8')).state;
  const b = C.fromPlantUML(`@startuml
package "04 Field" as P04 {
  class Pit <<FeatureType>> {
    +depth : Real [1]
  }
}
class SoilProfile <<stub P03>>
Pit "0..*" -- "0..1" SoilProfile : soilProfileOf
@enduml`).state;
  const rep = C.mergeState(a, b);
  assert.deepStrictEqual(rep.resolved, ['Pit']);
  assert.strictEqual(rep.relations, 0);
  assert.ok(!C.findClass(a.model, 'Pit').external);
  assert.strictEqual(C.findClass(a.model, 'Pit').package, '04 Field');
  assert.strictEqual(C.findClass(a.model, 'SoilProfile').external, undefined);
  assert.strictEqual(a.model.classes.length, 12);
});

ok('migrate v1 file', () => {
  const v1 = { model: { version: 1, name: 'NBS', classes: [{ name: 'GreenRoof', stereotype: 'FeatureType', superclass: 'AbstractOccupiedSpace', attributes: [{ name: 'd', type: 'Length', mult: '0..1' }] }], associations: [{ id: 'A1', from: 'GreenRoof', to: 'RoofSurface', name: 'on', role: 'roof', fromMult: '', toMult: '1..*', kind: 'association' }], notes: [], seq: 2 }, layout: { nodes: { GreenRoof: { x: 1, y: 2, pinned: true } }, edges: { 'assoc:A1': { off: 5 }, 'gen:GreenRoof': { off: -3 } }, notes: {} } };
  const st = C.migrate(v1);
  assert.strictEqual(st.model.version, 2);
  assert.strictEqual(st.model.profile, 'citygml');
  assert.deepStrictEqual(C.supersOf(st.model, 'GreenRoof'), ['AbstractOccupiedSpace']);
  assert.strictEqual(st.model.relations.find(r => r.id === 'A1').toRole, 'roof');
  assert.strictEqual(st.layout.edges.A1.off, 5);
  assert.strictEqual(Object.values(st.layout.edges).length, 2);
  assert.strictEqual(C.validate(st.model).filter(i => i.level === 'error').length, 0);
  assert.ok(C.toCityJSONExtension(st.model).extraCityObjects['+GreenRoof']);
  assert.deepStrictEqual(C.visibleRefs(st.model, false).sort(), ['AbstractOccupiedSpace', 'RoofSurface']);
});

ok('validator profiles', () => {
  const st = C.emptyState('X', 'citygml');
  C.applyOps(st, [{ op: 'add_class', name: 'Foo', attributes: [{ name: 'Bad Name', type: 'Nope', mult: '2..1' }] }, { op: 'add_class', name: 'A' }, { op: 'add_class', name: 'B', supers: ['A', 'Foo'] }]);
  const errs = (m) => C.validate(m).filter(i => i.level === 'error').length;
  assert.ok(errs(st.model) >= 4);
  st.model.profile = 'uml';
  assert.strictEqual(errs(st.model), 1);
  C.applyOps(st, [{ op: 'add_relation', kind: 'generalization', from: 'A', to: 'B' }]);
  assert.ok(C.validate(st.model).some(i => /Cycle/.test(i.msg)));
});

ok('big model: 400 classes validate + layout fast', () => {
  const st = C.emptyState('Big');
  const ops = [];
  for (let i = 0; i < 400; i++) ops.push({ op: 'add_class', name: 'C' + i, package: 'P' + (i % 12), superclass: i > 5 ? 'C' + Math.floor(i / 6) : undefined, attributes: Array.from({ length: 6 }, (_, k) => ({ name: 'a' + k, type: 'String' })) });
  for (let i = 0; i < 300; i++) ops.push({ op: 'add_relation', from: 'C' + (i * 7 % 400), to: 'C' + (i * 13 % 400), toRole: 'r' + i });
  let t = Date.now(); const r = C.applyOps(st, ops); const tOps = Date.now() - t;
  assert.strictEqual(r.failed.length, 0);
  t = Date.now(); C.validate(st.model); const tVal = Date.now() - t;
  const nodes = {};
  st.model.classes.forEach(c => nodes[c.name] = { w: 150, h: 120, parents: C.supersOf(st.model, c.name), links: [], type: false });
  t = Date.now(); const pos = C.layout(nodes); const tLay = Date.now() - t;
  console.log(`     ops ${tOps}ms, validate ${tVal}ms, layout ${tLay}ms`);
  assert.strictEqual(Object.keys(pos).length, 400);
  assert.ok(tVal < 1500 && tLay < 1500);
});
console.log(n, 'passed');

ok('colours: PlantUML import/export round trip', () => {
  const src = `@startuml
skinparam class {
  BackgroundColor<<CodeList>> #F7EEDB
}
package "Net" #DDEEFF {
  class Pipe <<FeatureType>> #LightGreen {
    +diameter : Length [0..1]
  }
  class Valve <<FeatureType>> #back:FFCC00;line:red
}
class Stub <<stub P1>>
@enduml`;
  const { state, report } = C.fromPlantUML(src);
  const S = state.layout.style;
  assert.strictEqual(report.skipped.length, 0, JSON.stringify(report.skipped));
  assert.deepStrictEqual(S.classes.Pipe, { fill: 'lightgreen' });
  assert.deepStrictEqual(S.classes.Valve, { fill: '#ffcc00', line: true });
  assert.deepStrictEqual(S.packages.Net, { fill: '#ddeeff' });
  assert.deepStrictEqual(S.stereotypes.CodeList, { fill: '#f7eedb' });
  const again = C.fromPlantUML(C.toPlantUML(state.model, { style: S }));
  assert.strictEqual(again.report.skipped.length, 0);
  assert.deepStrictEqual(again.state.layout.style.classes.Pipe, { fill: 'lightgreen' });
  assert.deepStrictEqual(again.state.layout.style.packages, S.packages);
  assert.deepStrictEqual(again.state.layout.style.stereotypes, S.stereotypes);
  const st = state; C.applyOps(st, [{ op: 'update_class', name: 'Pipe', set: { name: 'Conduit' } }]);
  assert.deepStrictEqual(st.layout.style.classes.Conduit, { fill: 'lightgreen' });
  C.applyOps(st, [{ op: 'delete_class', name: 'Conduit' }]);
  assert.strictEqual(st.layout.style.classes.Conduit, undefined);
});
ok('colours: Mermaid style / classDef / :::', () => {
  const { state, report } = C.fromMermaid("classDiagram\n class A\n class B:::hot\n class D\n classDef hot fill:#f96,stroke:#333\n style A fill:#9cf\n cssClass \"D\" hot");
  assert.strictEqual(report.skipped.length, 0, JSON.stringify(report.skipped));
  const S = state.layout.style.classes;
  assert.deepStrictEqual(S.A, { fill: '#9cf' });
  assert.deepStrictEqual(S.B, { fill: '#f96', line: true });
  assert.deepStrictEqual(S.D, { fill: '#f96', line: true });
  const again = C.fromMermaid(C.toMermaid(state.model, { style: state.layout.style }));
  assert.strictEqual(again.state.layout.style.classes.A.fill, '#9cf');
});
console.log(n, 'passed (with colours)');
