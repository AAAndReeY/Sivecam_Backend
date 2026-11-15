import { clasePorDefecto, clasificar, normalizarTipo } from './tipos-incidencia';

describe('tipos de incidencia: prioridad y nombre corto', () => {
  it('normaliza tildes, mayúsculas y espacios dobles', () => {
    expect(normalizarTipo('Presuntas actividades contra  el Patrimonio')).toBe('PRESUNTAS ACTIVIDADES CONTRA EL PATRIMONIO');
    expect(normalizarTipo('PRESUNTOS ACCIDENTES E INFRACCIONES AL TRÁNSITO Y TRANSPORTE')).toBe(
      'PRESUNTOS ACCIDENTES E INFRACCIONES AL TRANSITO Y TRANSPORTE',
    );
  });

  it('clasifica los tipos conocidos aunque vengan con espacios de más', () => {
    const c = clasePorDefecto('PRESUNTAS ACTIVIDADES CONTRA  EL PATRIMONIO', 'PATRIMONIO');
    expect(c).toEqual({ corto: 'Contra el patrimonio', prioridad: 'ALTA', categoria: 'PATRIMONIO' });
    expect(clasePorDefecto('PRESUNTAS ACTIVIDADES CONTRA LAS BUENAS COSTUMBRES').prioridad).toBe('BAJA');
  });

  it('usa el grupo del motor cuando el tipo no está en la lista, y abrevia el nombre', () => {
    const c = clasePorDefecto('PRESUNTAS ACTIVIDADES RARAS EN LA VIA', 'PERSONA');
    expect(c.prioridad).toBe('ALTA');
    expect(c.categoria).toBe('PERSONA');
    expect(c.corto).toBe('Actividades raras en la via');
    expect(clasePorDefecto('ALGO NUEVO', null)).toEqual({ corto: 'Algo nuevo', prioridad: 'MEDIA', categoria: 'OTROS' });
  });

  it('lo configurado por la torre manda sobre la regla por defecto', () => {
    const config = new Map([
      ['PRESUNTAS ACTIVIDADES CONTRA LAS BUENAS COSTUMBRES', { corto: 'Costumbres', prioridad: 'MEDIA', categoria: null }],
      ['OPERATIVO MUNICIPAL', { corto: '', prioridad: 'NO_EXISTE', categoria: 'X' }],
    ]);
    expect(clasificar('PRESUNTAS ACTIVIDADES CONTRA LAS BUENAS COSTUMBRES', 'ALCOHOL_COSTUMBRES', config)).toEqual({
      corto: 'Costumbres',
      prioridad: 'MEDIA',
      categoria: 'COSTUMBRES',
    });
    // Valores inválidos en la configuración: se conserva lo de por defecto
    expect(clasificar('OPERATIVO MUNICIPAL', null, config)).toEqual({ corto: 'Operativo municipal', prioridad: 'BAJA', categoria: 'OTROS' });
  });
});
