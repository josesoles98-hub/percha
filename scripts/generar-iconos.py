#!/usr/bin/env python3
"""
Genera los iconos de la PWA a partir de un dibujo vectorial simple.

Se versiona el script y no solo los PNG para poder regenerarlos si cambia
el nombre, el color o la forma, sin depender de un diseño externo perdido
en el chat de alguien.

    python3 scripts/generar-iconos.py

Requiere Pillow.
"""

from pathlib import Path

from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
PUBLICO = RAIZ / "apps" / "web" / "public"
APP = RAIZ / "apps" / "web" / "app"

FONDO = (11, 11, 12)      # --bg oscuro del sistema de diseño
TRAZO = (245, 245, 247)   # --ink oscuro

LADO = 1024  # se dibuja grande y se reduce: bordes más limpios


def dibujar_percha(escala_contenido: float) -> Image.Image:
    """
    Una percha centrada.

    `escala_contenido` deja margen para los iconos «maskable», que en
    Android se recortan en círculo: si el dibujo llega al borde, se come
    los extremos de la percha.
    """
    lienzo = Image.new("RGB", (LADO, LADO), FONDO)
    dibujo = ImageDraw.Draw(lienzo)

    centro = LADO / 2
    grosor = int(LADO * 0.055 * escala_contenido)

    # Gancho: tres cuartos de circunferencia que abren hacia abajo, con el
    # centro desplazado a la derecha para que el punto más a la izquierda
    # del arco caiga justo sobre el eje del mástil y ambos se unan sin
    # dejar hueco.
    radio = LADO * 0.085 * escala_contenido
    cima = centro - LADO * 0.19 * escala_contenido
    gancho_x = centro + radio
    dibujo.arc(
        [gancho_x - radio, cima - radio, gancho_x + radio, cima + radio],
        start=180,  # izquierda → arriba → derecha → abajo (en sentido horario)
        end=90,
        fill=TRAZO,
        width=grosor,
    )

    # Mástil: del arranque del gancho al vértice de los hombros.
    hombro_y = centro + LADO * 0.03 * escala_contenido
    dibujo.line(
        [(centro, cima), (centro, hombro_y)],
        fill=TRAZO,
        width=grosor,
    )

    # Hombros: dos diagonales que bajan desde el vértice.
    ancho = LADO * 0.33 * escala_contenido
    barra_y = centro + LADO * 0.17 * escala_contenido
    dibujo.line(
        [
            (centro - ancho, barra_y),
            (centro, hombro_y),
            (centro + ancho, barra_y),
        ],
        fill=TRAZO,
        width=grosor,
        joint="curve",
    )

    # Barra inferior, con las puntas redondeadas.
    dibujo.line(
        [(centro - ancho, barra_y), (centro + ancho, barra_y)],
        fill=TRAZO,
        width=grosor,
    )
    for x in (centro - ancho, centro + ancho):
        r = grosor / 2
        dibujo.ellipse([x - r, barra_y - r, x + r, barra_y + r], fill=TRAZO)

    return lienzo


def guardar(imagen: Image.Image, destino: Path, lado: int) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    imagen.resize((lado, lado), Image.LANCZOS).save(destino, "PNG", optimize=True)
    print(f"  {destino.relative_to(RAIZ)}  {lado}×{lado}")


def main() -> None:
    normal = dibujar_percha(1.0)
    # El «maskable» se recorta en círculo: el dibujo se encoge para que la
    # percha entera quede dentro de la zona segura.
    mascara = dibujar_percha(0.72)

    print("Generando iconos:")
    guardar(normal, PUBLICO / "icono-192.png", 192)
    guardar(normal, PUBLICO / "icono-512.png", 512)
    guardar(mascara, PUBLICO / "icono-mascara.png", 512)

    # Next.js sirve estos dos por convención de nombre de archivo.
    guardar(normal, APP / "icon.png", 256)
    guardar(normal, APP / "apple-icon.png", 180)


if __name__ == "__main__":
    main()
