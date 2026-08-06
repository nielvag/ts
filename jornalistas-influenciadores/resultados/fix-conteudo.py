import pandas as pd
import json
import os

# Caminho do arquivo
diretorio_atual = '/Users/nielsonvagno/Documents/tese - cópia/jornalistas-influenciadores/resultados/'
caminho_do_json = os.path.join(diretorio_atual, 'resultados-Thiago-dos-Reis.json')

with open(caminho_do_json, 'r', encoding='utf-8') as arquivo:
    DADOS = json.load(arquivo)

# A CORREÇÃO ESTÁ AQUI:
# record_path: aponta para a lista aninhada que você quer transformar em linhas
# meta: são os campos do nível superior (o 'id') que você quer repetir para cada item
df_main = pd.json_normalize(
    DADOS, 
    record_path=['resposta_json'], 
    meta=['id']
)

# Agora o dataframe está "flat" (plano) e você pode acessar as colunas diretamente:
# As colunas agora são: 'palavra', 'categoria', 'justificativa', 'subcategoria', 'subcategoria_justificativa', 'valor', 'id'

# --- EXIBIÇÃO DOS RESULTADOS ---

def imprimir_unicos(titulo, serie):
    print(f"\n--- {titulo} ---")
    # Limpando valores nulos para a visualização não quebrar
    for valor in serie.dropna().unique():
        print(f"- {valor}")

imprimir_unicos("Palavra", df_main['palavra'])
imprimir_unicos("Categoria", df_main['categoria'])
imprimir_unicos("Subcategoria", df_main['subcategoria'])

# Exemplo de como ver o dataframe completo caso precise conferir
# print(df_main.head())