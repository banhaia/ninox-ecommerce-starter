# Onboarding guiado por IA

> **Para la IA que lee esto:** una persona te pidió ayuda para empezar un proyecto con este starter. Seguí esta guía antes de tocar código. Para trabajar sobre el código después, la referencia es [`AGENTS.md`](AGENTS.md), [`CLAUDE.md`](CLAUDE.md) y la hoja de ruta [`docs/plan.md`](docs/plan.md).

Este repositorio es una **tienda online chica integrada a Ninox ERP**: catálogo sincronizado desde Ninox, vitrina editable, carrito, checkout con cierre por WhatsApp y pedidos enviados a Ninox sin duplicados. Si la persona quiere en cambio una **app de gestión para su empresa** (stock, reservas, ventas, reportes), el starter indicado es [ninox-integration-starters](https://github.com/banhaia/ninox-integration-starters). Confirmalo antes de seguir.

**Estado del proyecto:** está en construcción. La base y la sincronización del catálogo funcionan; la vitrina, el carrito/checkout y el envío de pedidos se completan siguiendo [`docs/plan.md`](docs/plan.md), que indica el próximo paso. Contáselo a la persona de entrada: puede que la primera tarea sea terminar una fase del plan.

## Principios

- **La persona puede no ser técnica.** Explicá en lenguaje simple qué vas a hacer y por qué, un paso por vez. Nada de jerga sin traducir.
- **No asumas el entorno.** Puede estar en Windows, macOS, Linux, una tablet o un celular, con un agente que ejecuta comandos o con un chat que solo conversa. Averigualo (mirando tu entorno o preguntando) y decidí vos los detalles técnicos.
- **Pedí permiso antes de instalar** algo en la computadora de la persona o de crear cuentas o repositorios a su nombre.
- **Nunca pidas el token de Ninox ni contraseñas por el chat.** Van en el archivo `.env` local o en las variables de entorno del hosting. Si la persona pega el token en el chat, avisale que conviene pedir uno nuevo.
- **Decí la verdad sobre lo que podés hacer.** Si no podés ejecutar comandos, no simules que lo hiciste.

## Paso 1. Entender a la persona

Preguntá, en una sola tanda y sin formulario largo:

1. **Qué vende y cómo quiere cerrar la venta** (hoy el cierre es por WhatsApp; el pago se acuerda ahí).
2. **Si ya usa Ninox** y si tiene el **token de la integración de terceros**. Si no lo tiene se pide en [ninoxnet.com/integraciones/terceros](https://www.ninoxnet.com/integraciones/terceros) o a dev@banhaia.com. Sin token la tienda levanta, pero vacía: el catálogo viene de Ninox.
3. **Quién lo va a mantener**: ella misma, alguien de su equipo o un tercero (desarrollador, agencia).

Una tienda pública recibe datos de clientes reales. Si la persona no se siente cómoda manejando una computadora con terminal o publicando un sitio, sugerí sumar a alguien técnico. Podés igual dejar todo preparado para pasárselo (ver "Paso 7").

## Paso 2. Ver desde dónde estás trabajando

| Tu entorno | Qué hacer |
|---|---|
| Agente con terminal y archivos en la computadora de la persona | Hacé los pasos vos, explicando cada uno. |
| Entorno de desarrollo en la nube (un workspace con terminal en el navegador) | Hacelo ahí. Explicá cómo abrir la tienda desde el puerto que exponga el entorno. |
| Solo chat (app de celular, web sin herramientas) | No podés ejecutar nada. Guiá paso a paso o recomendá una alternativa: un entorno en la nube que funcione desde el navegador, una computadora con un agente de código, o pasárselo a alguien. |

## Paso 3. Crear la copia propia del proyecto

El starter es un punto de partida: la persona necesita **su propio repositorio**, no trabajar sobre este. Elegí la opción según su situación y explicale la diferencia en una línea:

- **Repositorio nuevo a partir de este** (botón *Use this template* en GitHub, si está disponible): repo propio, puede ser privado, sin el historial del starter. Es la opción recomendada.
- **Fork**: copia pública vinculada a este repo. Sirve si quiere proponer mejoras al starter.
- **Clonar y subir a un repo nuevo**: si no usa GitHub o prefiere otro servicio. Conservá este repo como remoto `upstream` para traer las fases que se vayan completando.

Si no tiene cuenta en un servicio de repositorios, explicale para qué sirve (respaldo, historial, publicar la tienda: Vercel, Netlify y Azure despliegan desde ahí) y ayudala a crearla, o seguí en local y dejalo anotado como pendiente.

## Paso 4. Instalar lo necesario

Requisitos: **Git** y **Node.js** en la versión de [`.nvmrc`](.nvmrc) (mínimo la de `engines` en `package.json`). Verificá qué hay instalado y, con permiso, instalá lo que falte con el método habitual del sistema operativo. La base de datos de desarrollo (SQLite) viene incluida.

1. Copiá `.env.example` a `.env`.
2. Generá vos `SESSION_SECRET` y `CRON_SECRET` (valores largos al azar) y pedile a la persona que elija la clave del panel (`ADMIN_PASSWORD`) y la escriba ella en el `.env`.
3. Levantá la tienda:

```bash
npm install
npm run dev
```

Queda en `http://localhost:5173` y el panel en `/admin`. Si querés confirmar que todo está sano: `npm run validate`.

## Paso 5. Conectar con Ninox

1. La persona pega el token en `NINOX_TOKEN` del `.env`, con `NINOX_ENV=test`. Desarrollar siempre contra testing hasta que todo funcione.
2. Reiniciá la app y, en `/admin/productos`, sincronizá el catálogo. Ninox permite una consulta de catálogo cada pocos minutos: si hay que esperar, el panel lo indica.

## Paso 6. Adaptarla a su caso

Primero mirá [`docs/plan.md`](docs/plan.md): si la fase en curso no está terminada, proponé completarla (es lo que convierte el starter en una tienda usable). Después, preguntá qué quiere ajustar: textos, colores, logo, mensaje de WhatsApp, categorías destacadas. Proponé **un primer cambio chico** que pueda ver funcionando. Para lo que toca Ninox seguí el playbook de [`.claude/agents/ninox-integration-expert.md`](.claude/agents/ninox-integration-expert.md).

Guardá cada avance con un commit en su repositorio y explicale qué quedó guardado.

## Paso 7. Dejarlo listo para seguir

Antes de terminar, dejale a la persona un resumen corto:

- dónde está su repositorio y cómo volver a levantar la tienda;
- qué está configurado y qué falta (fases del plan, token de producción, publicar el sitio, dominio);
- el próximo paso sugerido.

Si va a continuar otra persona o un tercero, ese resumen más este repositorio alcanzan para que retome. Para publicar: [`docs/deploy.md`](docs/deploy.md).
