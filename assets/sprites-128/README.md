# Sobrevivente e moto — 128 direções

Folhas geradas com a ferramenta integrada de imagens, a partir das referências militares fornecidas. O personagem tem aparência andrógina, cabelo prateado curto, uniforme angular, máscara e capacete gasto, sem lenço. Roupa remendada, costuras improvisadas, botas reparadas, mochila remendada, cantil amassado, cobertor enrolado e mapa dobrado sugerem sobrevivência solitária prolongada. A moto preta e roxa foi preservada.

## Arquivos usados pelo jogo

- `moto-128.png`: moto sem piloto, 128 quadros.
- `sobrevivente-solitario-idle-16.png`: 16 poses paradas em grade 4 × 4, também usadas na composição montada.
- `sobrevivente-solitario-andar-64.png`: caminhada completa em oito direções, com oito quadros por direção, grade 8 × 8.
- `andar-preview.html`: prévia animada com direção, velocidade, pausa e seleção dos oito quadros.
- `atlas.js` e `atlas.json`: recortes, contato dos pneus/solas e origem do farol.
- `preview.html`: prévia das duas folhas utilizadas, com rotação, pausa e seleção de direção. Para conferir a composição montada, execute `node tests/animation-browser.test.js` e abra a imagem indicada pelo teste.
- `prompts.json`: conjunto exato dos prompts finais e ferramenta utilizada.

A moto mantém a grade 16 × 8; o novo personagem utiliza somente 16 poses em grade 4 × 4. `columns` e `rows` descrevem cada folha. Os 128 índices lógicos cobrem uma volta a partir da vista traseira; o personagem seleciona a pose mais próxima em passos de 22,5°. A altura a pé é normalizada em 34 unidades do jogo e a do tronco montado em 25, independentemente da resolução da imagem. Não há mistura entre desenhos, evitando silhuetas duplicadas.

A caminhada desenha um quadro completo por vez, sem recortar ou deformar pernas. Joelhos, botas, braços e mochila se movem juntos. A fase continua ao virar e volta à pose parada ao soltar o movimento. A escala é fixa durante todo o ciclo; pontos da cabeça e do chão estabilizam os recortes. As três imagens são carregadas uma única vez. A composição montada continua com 16 poses em um canvas de 2048 × 128 pixels (1 MiB), mantendo a posição recuada no banco e os apoios da moto.

Os pontos de apoio e de luz são medidos nos pixels das folhas atuais. A prévia marca os contatos no chão em verde para facilitar ajustes visuais. Estudos antigos e capturas sem uso foram removidos.

## Reconstruir metadados

As direções lógicas são calibradas separadamente para cada folha em
`tools/build-sprite-metadata.ps1`. `sourceDirections` indica a célula física usada
por cada direção. A moto antiga exige calibração; o personagem tem uma volta completa
em 16 poses. Não use o índice lógico diretamente como célula.
Os contatos dos pneus e a posição da lente são medidos nos pixels da própria
folha, sem copiar os apoios da moto antiga. O renderizador não aplica escala por direção.

Na raiz do projeto:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-sprite-metadata.ps1
```

O script lê os pixels sem alterar as imagens, valida 208 células não vazias e escreve os metadados das três folhas, incluindo os 64 quadros de caminhada. `atlas.json` é usado pelas ferramentas e testes; `atlas.js` carrega os mesmos dados no navegador.

Validação: `node tests/sprites-128.test.js`.
