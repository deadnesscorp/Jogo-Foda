# Sobrevivente e moto — 128 direções

Folhas geradas com a ferramenta integrada de imagens, inspiradas na referência `Folha de Sprites do Sobrevivente Pós-Apocalíptico.png` e na moto preta e roxa já existente no jogo.

## Arquivos usados pelo jogo

- `moto-128.png`: moto sem piloto, 128 quadros.
- `moto-piloto-128.png`: sobrevivente montado, mãos no guidão e pés nas pedaleiras, 128 quadros.
- `sobrevivente-128.png`: sobrevivente a pé, 128 quadros.
- `atlas.js` e `atlas.json`: recortes, contato dos pneus/solas e origem do farol.
- `preview.html`: prévia das três folhas, com rotação, pausa e seleção de direção.
- `prompts.json`: conjunto exato dos prompts finais e ferramenta utilizada.

Cada folha tem 16 colunas por 8 linhas e transparência real. Os 128 índices cobrem uma volta em passos de 2,8125 graus, a partir da vista traseira. As poses foram geradas por IA e têm pequenas diferenças de perspectiva; o jogo suaviza a troca entre sprites vizinhos. O piloto está integrado à moto, evitando desenhá-lo duas vezes e separando as silhuetas de sombra da moto estacionada e da moto ocupada.

A animação a pé acrescenta passos alternados das botas e um leve movimento do corpo. As três imagens são carregadas uma única vez; as misturas da moto e as máscaras de sombra continuam em cache. A folha `sobrevivente-128-estudo.png` é um estudo anterior e não é carregada pelo jogo.

Os pontos de apoio e de luz foram recalibrados a partir da folha anterior. A prévia marca os contatos no chão em verde para facilitar ajustes visuais.

## Reconstruir metadados

Na raiz do projeto:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-sprite-metadata.ps1
```

O script lê os pixels das folhas sem alterar as imagens, valida 384 células não vazias e escreve os metadados. As folhas anteriores permanecem em `assets/moto` como referência para os pontos de apoio.

Validação: `node tests/sprites-128.test.js`.
