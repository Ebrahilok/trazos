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

## Descargar para Android

[Descargar Trazo 2.5.1 APK](apk/Trazo-tablet-v2.5.1.apk)

Compatible con Android 7 o posterior. La aplicación funciona sin conexión; sólo
necesita internet cuando se comparte un archivo mediante Drive o WhatsApp.

La hoja admite zoom y desplazamiento con dos dedos hasta 250%, incluso mientras
está activa la herramienta de dibujo. El selector de color incluye una paleta
táctil, controles de tono, saturación y luminosidad, código hexadecimal y colores
recientes.

El botón **↻ Vista** gira la hoja en pasos de 90 grados sólo para verla. La
orientación real del documento y del PDF no cambia; la edición se pausa hasta
regresar la vista a 0 grados.

La escritura personalizada detecta los renglones, comienza después del margen y
distribuye automáticamente el texto largo entre páginas. Las anotaciones rápidas
también se ajustan a la cuadrícula de la hoja. Se corrigió la duplicación de
páginas al desbordar contenido y la mezcla de páginas al cambiar de actividad.

La versión 2.5 comparte la biblioteca de letras entre todas las tareas, conserva
por separado mayúsculas y minúsculas y construye vocales acentuadas a partir de
la letra base. Incluye plantillas globales de portada y página, recorte cuadrado
de imágenes, resaltador, borrado por trazo, figuras de esquema y controles para
duplicar y reordenar páginas. Los proyectos también mantienen una copia de
respaldo local en IndexedDB.

También permite editar el contenido manuscrito después de colocarlo, seleccionar
varios objetos con lazo, borrar partes de un dibujo y reconocer líneas o formas.
Incluye miniaturas para ordenar páginas, conectores que siguen a las figuras,
capas con visibilidad y orden, versiones restaurables y un asistente que muestra
qué letras faltan. El PDF puede usar tamaño Carta o A4, márgenes y rangos de
páginas. El modo lectura oculta las herramientas para revisar la tarea terminada.
El borrador parcial recorta sólo los trazos dibujados y nunca tapa el fondo, los
renglones ni el margen de la hoja.

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
