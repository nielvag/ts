import pandas as pd
import json
import os

# Caminho do arquivo
diretorio_atual = '/Users/nielsonvagno/Documents/tese - cópia/planilhas-colunista/resultados/'
caminho_do_json = os.path.join(diretorio_atual, 'resultados-natalia-viana.json')

with open(caminho_do_json, 'r', encoding='utf-8') as arquivo:
    DADOS = json.load(arquivo)

# Normaliza os dados extraindo a lista aninhada e puxando o ID
df_main = pd.json_normalize(
    DADOS, 
    record_path=['resposta_json'], 
    meta=['id']
)

# --- FUNÇÃO DE EXIBIÇÃO ---

def imprimir_unicos(titulo, serie):
    print(f"\n--- {titulo} ---")
    # Limpando valores nulos para a visualização não quebrar
    for valor in serie.dropna().unique():
        print(f"- {valor}")

# --- EXIBIÇÃO DOS RESULTADOS GERAIS ---
imprimir_unicos("Palavra", df_main['palavra'])
imprimir_unicos("Categoria", df_main['categoria'])
imprimir_unicos("Subcategoria", df_main['subcategoria'])

# --- EXIBIÇÃO DOS VALORES (NOMES E RELAÇÕES SEPARADOS) ---

if 'valor.nome' in df_main.columns:
    # Como 'valor.nome' é uma lista dentro da célula, usamos .explode() 
    # para separar cada item da lista em uma linha e depois pegamos os únicos.
    serie_nomes = df_main['valor.nome'].explode()
    imprimir_unicos("Nomes de Valores", serie_nomes)
else:
    print("\n--- Nomes de Valores ---")
    print("- Nenhum nome de valor encontrado.")

if 'valor.relacao' in df_main.columns:
    # A relação é apenas uma string de texto, então podemos passar direto
    imprimir_unicos("Relações", df_main['valor.relacao'])
else:
    print("\n--- Relações ---")
    print("- Nenhuma relação encontrada.")