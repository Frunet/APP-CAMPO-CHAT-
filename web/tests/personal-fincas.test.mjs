import assert from 'node:assert/strict';
import { test } from 'node:test';
import { grupoPersonal } from '../src/lib/grupos-personal.ts';
import { activoEnFinca, fincasActivas, fincasEnVista } from '../src/lib/personal-fincas.ts';

test('agrupa las fincas confirmadas y conserva visibles las otras', () => {
  for (const nombre of ['PAI MANGO', 'Casa', 'Fortaleza', 'AVO CASA', 'AVO FORTA']) assert.equal(grupoPersonal({nombre}), 'PAI');
  for (const nombre of ['LOMAS', 'Loma Mecias', 'Loma Nisperos', 'Río Seco']) assert.equal(grupoPersonal({nombre}), 'LOMAS');
  assert.equal(grupoPersonal({nombre:'RÍO VÉLEZ'}), 'FRUNET');
  assert.equal(grupoPersonal({nombre:'Finca nueva'}), 'Otras fincas');
  assert.equal(grupoPersonal({nombre:'PAISAJE'}), 'Otras fincas');
});

const trabajador = {activo:true, trabajadores_fincas:[{finca_id:'mango',activo:true},{finca_id:'casa',activo:true},{finca_id:'seco',activo:false}]};
test('un trabajador está activo en varias fincas y la baja es independiente', () => {
  assert.deepEqual(fincasActivas(trabajador), ['mango','casa']);
  assert.equal(activoEnFinca(trabajador, 'mango'), true);
  assert.equal(activoEnFinca(trabajador, 'casa'), true);
  assert.equal(activoEnFinca(trabajador, 'seco'), false);
  assert.equal(activoEnFinca(trabajador, 'otra'), false);
});
test('los filtros distinguen la actividad de cada asignación', () => {
  assert.deepEqual(fincasEnVista(trabajador, 'activo'), ['mango','casa']);
  assert.deepEqual(fincasEnVista(trabajador, 'inactivo'), ['seco']);
  assert.deepEqual(fincasEnVista(trabajador, ''), ['mango','casa','seco']);
});
test('la baja global desactiva todas las fincas y las fichas sin asignación no registran horas', () => {
  const baja={...trabajador,activo:false};
  assert.equal(activoEnFinca(baja,'casa'), false);
  assert.deepEqual(fincasEnVista(baja,'activo'), []);
  assert.deepEqual(fincasEnVista(baja,'inactivo'), ['mango','casa','seco']);
  assert.equal(activoEnFinca({activo:true,trabajadores_fincas:[]},'mango'), false);
});
