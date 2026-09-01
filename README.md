# Trazo

Editor para crear una escritura propia a partir de varias muestras de cada letra.

Cada carácter puede guardar diez o más variantes. Al escribir, Trazo mezcla esas
muestras y cambia ligeramente la separación, la altura y la inclinación para que
el resultado conserve un pulso más natural.

Trazo funciona como un cuaderno de tareas: cada hoja admite cuadros de texto,
escritura personalizada, dibujos, símbolos e imágenes que se pueden mover,
redimensionar, girar, ordenar y bloquear. También incluye portadas reutilizables,
fondos de cuaderno, varias páginas, exportación exacta a PDF y archivos `.trazo`
para continuar una tarea en otra tablet.

## Web

```bash
npm install
npm run dev
```

La versión publicada está en [trazo-escritura.ebrahilok.chatgpt.site](https://trazo-escritura.ebrahilok.chatgpt.site/).

## Android

El proyecto de la aplicación para tablet está en `android/`. Funciona sin conexión
y guarda el cuaderno y las muestras en el dispositivo.

Para generar un APK de prueba:

```bash
cd android
./gradlew assembleDebug
```

El archivo se crea en `android/app/build/outputs/apk/debug/`.
