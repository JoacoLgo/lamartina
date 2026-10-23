# Publicar en App Store y Play Store

> **Antes de gastar:** la app ya funciona como sitio web y se puede mostrar al club con un enlace o un QR, sin cuentas de
> desarrollador (ver `ROADMAP.md`, sección "Cómo mostrarla al club sin publicar en tiendas"). Esta guía queda para cuando
> decidan publicar en las tiendas.

> Nota de versión: el proyecto usa Expo SDK 54 (compatible con Expo Go de la App Store). Antes de publicar hay que
> verificar los requisitos de ese momento y, si hace falta, actualizar la versión del SDK.

Los requisitos de las tiendas cambian seguido: antes de publicar, verificá las páginas oficiales
(links al final). Esto es lo vigente a octubre de 2026 según lo que pude consultar.

## Cuentas y costos

| | Apple App Store | Google Play |
|---|---|---|
| Cuenta | Apple Developer Program | Cuenta de desarrollador de Google Play |
| Costo | 99 USD por año | pago único (25 USD, verificalo al registrarte) |
| Pago | tarjeta internacional en USD | tarjeta internacional en USD |
| Identidad | Apple ID con verificación | documento de identidad (cuenta personal) |

Ojo con los impuestos/percepciones que le suma tu banco a los pagos en dólares desde Argentina.

## Requisitos técnicos

**Apple**
- Desde el 28/04/2026 toda subida a App Store Connect debe compilarse con **Xcode 26 / SDK de iOS 26**.
  Xcode solo corre en Mac. **Sin Mac**: usá **EAS Build** (compila en la nube) — ver abajo.
- Una "build" de prueba por TestFlight antes de enviar a revisión.

**Google**
- Desde el 31/08/2026 las apps nuevas y las actualizaciones deben apuntar a **Android 16 (API 36)**.
  EAS/Expo lo configura según la versión del SDK, pero confirmalo en el primer build.
- Se sube un archivo **.aab** (Android App Bundle), no un .apk.
- **Regla importante para cuentas personales nuevas** (creadas después del 13/11/2023): antes de pasar a
  producción hay que hacer una **prueba cerrada con al menos 12 testers durante 14 días seguidos**. Si uno
  se baja a mitad, se puede reiniciar el conteo. Las cuentas de **organización** están exentas (pero piden
  verificación de empresa). Conviene arrancar a reclutar testers (amigos del club) ya mismo; sumá el tiempo
  de revisión: calculá unas 3 semanas para el primer lanzamiento.

## Lo que piden las dos tiendas

- **Identificador único** de la app (`bundleIdentifier` / `package`): cambialo en `app.json` antes de empezar.
- **Ícono** 1024×1024 sin transparencia, **capturas de pantalla** (varios tamaños de teléfono),
  **descripción**, palabras clave y categoría (Deportes).
- **Política de privacidad** con URL pública (aunque la app hoy no recolecte datos, es lo más seguro tener una; es obligatoria si recolectás datos).
- **Formularios de datos**: "App Privacy" en Apple y "Seguridad de los datos" en Google. Hoy la app guarda todo
  en el teléfono y no envía nada: declaralo así, y actualizalo apenas sumes GPS, cuentas o nube.
- **Clasificación por edades** (cuestionario).
- Si más adelante agregás **cuentas de usuario**: ambas tiendas exigen que se pueda **borrar la cuenta desde la app**.
- Apple suele rechazar apps "mínimas" o que parecen un sitio web empaquetado (guideline 4.2): lo
  que suma es la utilidad real (formatos, orden de salida, estadísticas, offline).

## Flujo con EAS (sin necesidad de Mac)

```bash
npm install -g eas-cli      # herramienta de línea de comandos de Expo para compilar y subir
eas login                   # cuenta gratuita de expo.dev
eas build:configure         # genera eas.json
eas build --platform android --profile production   # compila el .aab en la nube
eas build --platform ios --profile production       # compila iOS en la nube (pide tu cuenta de Apple)
eas submit --platform android   # sube a Play Console
eas submit --platform ios       # sube a App Store Connect
```

EAS tiene plan gratuito con cupo limitado de builds por mes (verificá el cupo actual).

## Orden sugerido

1. Probar la app en tu celular y en el de 2–3 amigos (Expo Go).
2. Crear la cuenta de Google Play y **abrir ya** la prueba cerrada (empieza el reloj de 14 días).
3. Ajustar la app con el feedback; preparar ícono, capturas y política de privacidad.
4. Cuenta de Apple + TestFlight.
5. Enviar a revisión en ambas tiendas.

## Fuentes oficiales para verificar

- Apple, requisitos próximos: https://developer.apple.com/news/upcoming-requirements/
- Apple, App Store Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Google, requisitos de prueba para cuentas personales nuevas: Play Console Help → "Testing requirements for new personal developer accounts"
- Google, nivel de API objetivo: https://developer.android.com/google/play/requirements/target-sdk
- Expo EAS: https://docs.expo.dev/build/introduction/
