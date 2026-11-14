## Jogo-Foda — Descrição do Projeto

**Jogo-Foda** é um jogo de sobrevivência pós-apocalíptico em 2D, com perspectiva isométrica, desenvolvido para rodar diretamente no navegador. Inspirado na atmosfera de *Girls' Last Tour*, o jogo apresenta um mundo devastado, onde o jogador precisa explorar construções abandonadas, coletar recursos, cuidar da própria saúde e realizar a manutenção de sua motocicleta.

O jogo possui ciclo de dia e noite, criaturas hostis com inteligência artificial, sistema de combate e ferimentos, gerenciamento de fome, sede e cansaço, além de mecânicas interativas de reparo e sobrevivência.

### Tecnologias utilizadas

O projeto foi desenvolvido com o auxílio de duas ferramentas de inteligência artificial:

- **ChatGPT (OpenAI):** utilizado no planejamento do jogo, criação de conceitos, desenvolvimento de ideias, elaboração de mecânicas e auxílio na criação de recursos visuais.
- **Codex (OpenAI):** utilizado na implementação do código, desenvolvimento dos sistemas, integração das mecânicas, correção de erros e realização de testes.

O desenvolvimento utiliza **HTML, CSS e JavaScript**, com testes automatizados em **Node.js**, permitindo que o jogo funcione diretamente em navegadores, sem necessidade de instalação.


### Executar o jogo

Abra `index.html` no navegador. Não é necessário instalar dependências nem compilar.

### Organização

- `src/`: JavaScript do jogo e seus sistemas.
- `styles/`: estilos da página e do painel de saúde.
- `assets/`: imagens, sprites, atlas e metadados.
- `previews/`: catálogos de criaturas e construções.
- `tests/`: testes de lógica e páginas de verificação no navegador.
- `tools/`: geradores de metadados e executor de testes.

Os caminhos das imagens são relativos à página `index.html`. As prévias usam a raiz do projeto como base. A ordem dos scripts em `index.html` respeita as dependências entre sistemas.

### Verificação

Com Node.js disponível, execute `npm test` (ou `node tools/run-tests.js`) para rodar todos os testes de lógica. O comando mostra cada falha e termina com código de erro se algum teste falhar.

Para os testes de integração, com Chrome ou Edge instalado:

- `npm run test:browser`: abertura, controles e renderização via HTTP e arquivo local.
- `npm run test:animation`: animações no navegador.

Não é necessário executar `npm install`. Os testes usam os módulos nativos do Node.js.

Para conferir apenas abertura, teclado, renderização e recursos, execute `npm run test:smoke`.

Na revisão de organização, 9 dos 17 testes de lógica passaram. As 8 falhas restantes foram reproduzidas na versão original: saúde, combate, cerco, ignição, criaturas, cache da moto, corrida e atlas de sprites. O teste completo de navegador também encontra um painel de saúde ausente.

### Otimizações de execução

A iluminação reutiliza o resultado enquanto tempo, hora inicial e tamanho da
área de jogo permanecem iguais. Computadores completamente fora da tela deixam
de enviar comandos de desenho. O ciclo diário, as sombras e a atualização das
mecânicas continuam ativos.

Foram removidos os modos antigos de cabos do terminal, cuja função de entrada
não era chamada, e as chamadas vazias do painel de saúde desativado. O fluxo
atual de três perguntas, escolha de melhoria e conclusão dos cinco computadores
continua coberto por `tests/frame-optimization.test.js`, junto da reutilização
da iluminação e da visibilidade dos computadores. Vida, dano e cura rápida
continuam no sistema atual.
