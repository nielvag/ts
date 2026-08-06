import pandas as pd
import json
import os
# Caminho do arquivo (mantendo a lógica segura)
diretorio_atual = '/Users/nielsonvagno/Documents/tese - cópia/planilhas-colunista/resultados/'
caminho_do_json = os.path.join(diretorio_atual, 'carlos-alberto-di-franco-discurso.json')

with open(caminho_do_json, 'r', encoding='utf-8') as arquivo:
    DADOS = json.load(arquivo)

# 1. Extração para Categorias (que está em uma lista aninhada)
df_categorias = pd.json_normalize(DADOS, record_path=['resposta_json', 'categorias'])

# 2. Extração para as outras chaves (que estão no nível raiz de resposta_json)
df_main = pd.json_normalize(DADOS)

# 3. Explodir a lista de 'estrategias-de-legitimacao' para listar cada item individualmente
df_estrategias = df_main.explode('resposta_json.estrategias-de-legitimacao')

# --- EXIBIÇÃO DOS RESULTADOS ---

def imprimir_unicos(titulo, serie):
    print(f"\n--- {titulo} ---")
    for valor in serie.dropna().unique():
        print(f"- {valor}")

imprimir_unicos("Categorias", df_categorias['categoria'])
imprimir_unicos("Posição Sujeito", df_main['resposta_json.posicao-sujeito'])
imprimir_unicos("Papel Enunciativo", df_main['resposta_json.papel-enunciativo'])
imprimir_unicos("Estratégias de Legitimação", df_estrategias['resposta_json.estrategias-de-legitimacao'])
imprimir_unicos("Papel do Leitor", df_main['resposta_json.papel-do-leitor'])