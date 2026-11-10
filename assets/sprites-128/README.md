# Sprites do protagonista e da moto

O jogo mantém 128 orientações lógicas. As vistas geradas têm espaçamento angular
aproximado e são calibradas antes da seleção dos quadros.

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
Não lê pixels no navegador, permitindo abrir `index.html` diretamente. As sombras
usam os contatos dos pneus medidos na arte montada e acompanham sua escala reduzida.
O arquivo anterior `piloto-moto-unificado.png` foi preservado como referência.

Os sprites separados `sobrevivente-piloto-sentado-128.png`,
`sobrevivente-piloto-sentado-128.json`, `piloto-recortes.js` e
`piloto-sentado-preview.html` estão preservados como material de origem e não são
sobrepostos à moto durante o jogo.

## Outros assets

- `moto-128.png`: moto estacionada, com 128 quadros físicos calibrados.
- `sobrevivente-parado-direcional-16.png`: poses paradas atuais, com 16 vistas alinhadas à caminhada.
- `sobrevivente-solitario-idle-16.png`: folha parada anterior, preservada como referência.
- `sobrevivente-solitario-andar-64.png`: oito vistas com oito quadros de caminhada.
- `atlas.js` e `atlas.json`: recortes e âncoras dos sprites a pé e da moto original.
- `andar-preview.html` e `preview.html`: prévias das folhas originais.

A altura a pé é normalizada em 34 unidades, com escala visual global de 0,75.
As vistas intermediárias a pé são interpoladas para as 128 orientações lógicas.
A última orientação de movimento é guardada por modo de jogo e permanece fixa
ao parar, mesmo que o renderizador receba outro ângulo durante a imobilidade.

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
