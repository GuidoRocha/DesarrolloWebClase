const entities = require('@jetbrains/youtrack-scripting-api/entities');
const dateTime = require('@jetbrains/youtrack-scripting-api/date-time');

// 1) onChange: cada vez que cambie el campo 'Estado', guardo la fecha
exports.recordStateChange = entities.Issue.onChange({
  title: 'Registrar fecha de cambio de Estado',
  guard: ctx => ctx.issue.fields.isChanged(ctx.StateField),
  action: ctx => {
    // La fecha exacta (ahora) en que se movió de Estado
    ctx.issue.fields['Fecha cambio estado'] = new Date();
  },
  requirements: {
    StateField: {
      type: entities.State.fieldType,
      name: 'Estado HES'
    },
    FechaCambioField: {
      type: entities.Field.dateType,
      name: 'Fecha cambio estado'
    }
  }
});

// 2) onSchedule: cada noche reviso todas las issues y ajusto Semáforo
exports.globalSemaphore = entities.Issue.onSchedule({
  title: 'Semáforo global cada 60 días si está idle',
  
  // Sólo tu proyecto
  search: 'project: "Prueba LATAMO"',
  cron:  '0 0 0 * * ?',   // a medianoche
  notify: false,
  
  action: ctx => {
    const issue = ctx.issue;
    
    // 2.1) Obtengo la fecha de cambio de Estado
    const fechaCambio = issue.fields['Fecha cambio estado'];
    if (!fechaCambio) {
      // --- Inicialización para cards viejas o recién creadas ---
      // Si nunca tuvimos FechaCambio, arranco en Verde y pongo ahora como fecha
      const verde = getColor('Verde', ctx);
      issue.fields['Semáforo'] = verde;
      issue.fields['Fecha cambio estado'] = new Date();
      return;
    }
    
    // 2.2) Si la card tuvo alguna modificación DESPUÉS de ese cambio de Estado,
    //      la dejamos quieta (no avanzamos semáforo)
    if (issue.updated.getTime() > fechaCambio.getTime()) {
      return;
    }
    
    // 2.3) Calculo días transcurridos desde el cambio de Estado
    const diffDays = dateTime.dayPeriod(fechaCambio, Date.now());
    
    // 2.4) Cada 60 días = un paso en el semáforo
    //      0 → Verde, 1 → Amarillo, 2 → Naranja, ≥3 → Rojo
    const step = Math.floor(diffDays / 60);
    
    // 2.5) Mapeo colores al Enum 'Semáforo'
    let nextColor;
    if (step >= 3)        nextColor = getColor('Rojo', ctx);
    else if (step === 2)  nextColor = getColor('Naranja', ctx);
    else if (step === 1)  nextColor = getColor('Amarillo', ctx);
    else                  nextColor = getColor('Verde', ctx);
    
    // 2.6) Asigno al campo
    issue.fields['Semáforo'] = nextColor;
  },
  
  requirements: {
    SemaforoField: {
      type: entities.Field.enumType,
      name: 'Semáforo'
    },
    FechaCambioField: {
      type: entities.Field.dateType,
      name: 'Fecha cambio estado'
    }
  }
});

// ------------------------------------------------------------------
// UTIL: busca en el Enum 'Semáforo' el valor con ese nombre
// ------------------------------------------------------------------
function getColor(name, ctx) {
  const enumVals = ctx.issue.project.customFields
    .find(cf => cf.name === 'Semáforo')
    .fieldType.values;
  return enumVals.find(x => x.name === name);
}
