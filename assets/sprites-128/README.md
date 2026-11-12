# Sprites do protagonista e da moto

A moto mantém 128 orientações lógicas. O personagem a pé usa 128 orientações, com uma folha de 128 poses paradas.

## Arte montada atual

`piloto-moto-angular.png` contém piloto e moto desenhados juntos, com roupa e
membros menos arredondados, conforme o protagonista a pé. A posição das
mãos, do banco e das pernas pertence à própria arte. O jogo não combina máscaras
de pernas, braços ou metades do piloto.

A folha contém 112 desenhos físicos em 16 colunas e sete fileiras, mapeados para
128 orientações. `piloto-moto-unificado.js` e o JSON correspondente contêm os
recortes das silhuetas conectadas, os contatos dos pneus e a origem do farol.
Os recortes seguem o sprite inteiro, mesmo quando atravessa a grade nominal.

`mounted-rider.js` prepara 128 poses e nove inclinações, com altura visual estável.
As poses montadas são escolhidas pelo ângulo na tela em `sourceHeadings`, calibrado
pelo eixo dos pneus. A sequência da folha não representa giros de ângulo uniforme;
as vistas traseiras repetidas compartilham a mesma direção.
Não lê pixels no navegador, permitindo abrir `index.html` diretamente. As sombras
usam os contatos dos pneus medidos na arte montada e acompanham sua escala reduzida.

Os sprites separados `sobrevivente-piloto-sentado-128.png`,
`sobrevivente-piloto-sentado-128.json`, `piloto-recortes.js` e
`piloto-sentado-preview.html` estão preservados como material de origem e não são
sobrepostos à moto durante o jogo.

## Outros assets

- `moto-128.png`: moto estacionada, com 128 quadros físicos calibrados.
- `sobrevivente-parado-128.png`: folha atual com 128 poses paradas, em 16 colunas e oito fileiras.
- `atlas.js` e `atlas.json`: recortes e âncoras dos sprites a pé e da moto original.
  As poses a pé usam os limites das 128 silhuetas completas, mesmo quando
  atravessam a grade nominal, para manter a escala igual nas diagonais.
- `preview.html`: prévia da moto e das poses paradas.

A altura a pé é normalizada em 34 unidades, com escala visual global de 0,60.
O deslocamento usa uma caminhada simples calculada sobre a pose original: duas
regiões das pernas giram a partir dos joelhos sem esticar ou deformar a arte,
com sobreposição nas articulações, o torso inteiro e um balanço leve.
Os antebraços são medidos por pose a partir das mãos, incluindo os dedos no
recorte. Eles giram nos cotovelos em oposição aos passos, com sobreposição da
manga na articulação. Cabeça, ombros, mochila e casaco ficam estáveis; as mãos
originais são mascaradas também nas regiões das pernas para evitar duplicação.
A fase acompanha a distância realmente percorrida; colisões não
fazem o personagem marchar parado. A amplitude diminui ao soltar o movimento.
As velocidades continuam em 16 km/h andando e 35 km/h correndo. A arte montada
foi mantida. A prévia fica em `tests/simple-walk-browser.html`.

## Reconstrução e verificação

Para reconstruir os recortes montados:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-mounted-metadata.ps1
```

Para reconstruir os metadados originais:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-sprite-metadata.ps1
```

Para verificar a arte montada em Chromium e gerar as prévias:

```powershell
$env:JOGO_MOUNTED_PREVIEW='1'
node tests/animation-browser.test.js
```

O teste verifica as 128 orientações, os apoios dos pneus, os limites dos recortes,
um único desenho por pose e o carregamento por HTTP e por arquivo local.
`piloto-moto-preview.png` mostra 16 vistas; `piloto-moto-laterais.png` mostra
seis vistas ampliadas para inspeção visual.
