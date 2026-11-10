# Calculadora de cafeína en el cuerpo

Aplicación hecha con React y Vite que muestra los niveles estimados de cafeína a lo largo de 24 horas. Haz clic en el gráfico para añadir un recipiente, arrástralo para cambiar la hora o haz clic en un marcador para eliminarlo.

Las rondas de mate se modelan con 6, 8 o 10 cebadas repartidas durante una hora, suponiendo 150 ml y 50 mg de cafeína por cebada. Así, las rondas estimadas son de 0,9 L/300 mg, 1,2 L/400 mg o 1,5 L/500 mg, respectivamente. El valor de 50 mg es un valor predeterminado conservador dentro del rango de 41,82–82,4 mg por 150 ml citado en [un estudio sobre las condiciones de preparación del mate](https://pmc.ncbi.nlm.nih.gov/articles/PMC11173391/).

## Requisitos

- Node.js 24 o posterior

## Comandos

```sh
npm install
npm run dev
npm run build
npm run lint
```
